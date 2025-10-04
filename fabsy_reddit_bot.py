#!/usr/bin/env python3
"""
Fabsy reddit bot - improved:
 - uses timezone-aware datetimes
 - safe posting with retries and backoff
 - soft-ask flow: bot asks "Want the guide?" and only posts link after OP replies "yes"
 - logging to file
 - sqlite tracking for replied + pending queue
"""

import os
import re
import time
import random
import logging
import sqlite3
import smtplib
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import praw
import prawcore

# ------- config -------
load_dotenv()
CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
USERNAME = os.getenv("REDDIT_USERNAME")
PASSWORD = os.getenv("REDDIT_PASSWORD")
USER_AGENT = os.getenv("USER_AGENT", f"FabsyTrafficBot/0.1 by u/{USERNAME}")
SUBREDDITS = os.getenv("SUBREDDITS", "Calgary+Edmonton+Alberta")
MAX_REPLIES_PER_DAY = int(os.getenv("MAX_REPLIES_PER_DAY", "8"))
DB_PATH = os.getenv("DB_PATH", "fabsy_replied.db")
UTM_BASE = os.getenv("FABSY_BASE", "https://fabsy.ca/traffic-tickets")
SOFT_ASK_EXPIRE_HOURS = int(os.getenv("SOFT_ASK_EXPIRE_HOURS", "48"))
LOG_FILE = os.getenv("BOT_LOG", "fabsy_bot.log")

# Email notification config
NOTIFY_EMAIL = os.getenv("NOTIFY_EMAIL")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SEND_NOTIFICATIONS = os.getenv("SEND_NOTIFICATIONS", "false").lower() == "true"
NOTIFY_ON_REPLY = os.getenv("NOTIFY_ON_REPLY", "true").lower() == "true"
NOTIFY_ON_ERROR = os.getenv("NOTIFY_ON_ERROR", "true").lower() == "true"
NOTIFY_ON_MODERATION = os.getenv("NOTIFY_ON_MODERATION", "true").lower() == "true"

# keyword detection
KEYWORD_RE = re.compile(
    r'\b(ticket|ticketed|speeding|citation|fine|traffic ticket|got a ticket|cop stopped|speed trap)\b', re.I
)
YES_RE = re.compile(r'\b(yes|yep|please|link|sure|send)\b', re.I)

# ------- logging -------
logger = logging.getLogger("fabsy_bot")
logger.setLevel(logging.INFO)
fh = logging.FileHandler(LOG_FILE)
fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
fh.setFormatter(fmt)
logger.addHandler(fh)
# also log to stdout
sh = logging.StreamHandler()
sh.setFormatter(fmt)
logger.addHandler(sh)

# ------- reddit client -------
reddit = praw.Reddit(
    client_id=CLIENT_ID,
    client_secret=CLIENT_SECRET,
    username=USERNAME,
    password=PASSWORD,
    user_agent=USER_AGENT,
)

# ------- DB init -------
conn = sqlite3.connect(DB_PATH, check_same_thread=False)
c = conn.cursor()
c.execute("""CREATE TABLE IF NOT EXISTS replied (item_id TEXT PRIMARY KEY, created_at INTEGER)""")
c.execute("""CREATE TABLE IF NOT EXISTS reply_log (date TEXT, subreddit TEXT, count INTEGER, PRIMARY KEY(date, subreddit))""")
c.execute("""CREATE TABLE IF NOT EXISTS pending (
    orig_comment_id TEXT PRIMARY KEY,
    orig_author TEXT,
    prompt_id TEXT,
    expires_at INTEGER
)""")
conn.commit()

# ------- helpers -------
def now_utc():
    return datetime.now(timezone.utc)

def has_replied(item_id):
    c.execute("SELECT 1 FROM replied WHERE item_id = ?", (item_id,))
    return c.fetchone() is not None

def mark_replied(item_id):
    now_ts = int(now_utc().timestamp())
    c.execute("INSERT OR REPLACE INTO replied (item_id, created_at) VALUES (?,?)", (item_id, now_ts))
    conn.commit()

def get_today_count(subreddit):
    date = now_utc().strftime("%Y-%m-%d")
    c.execute("SELECT count FROM reply_log WHERE date=? AND subreddit=?", (date, subreddit))
    row = c.fetchone()
    return row[0] if row else 0

def incr_today_count(subreddit):
    date = now_utc().strftime("%Y-%m-%d")
    cur = get_today_count(subreddit)
    if cur == 0:
        c.execute("INSERT OR REPLACE INTO reply_log (date, subreddit, count) VALUES (?,?,?)", (date, subreddit, 1))
    else:
        c.execute("UPDATE reply_log SET count=? WHERE date=? AND subreddit=?", (cur+1, date, subreddit))
    conn.commit()

def add_pending(orig_comment_id, orig_author, prompt_id, expire_hours=SOFT_ASK_EXPIRE_HOURS):
    expires = int((now_utc() + timedelta(hours=expire_hours)).timestamp())
    c.execute("INSERT OR REPLACE INTO pending (orig_comment_id, orig_author, prompt_id, expires_at) VALUES (?,?,?,?)",
              (orig_comment_id, orig_author, prompt_id, expires))
    conn.commit()

def pop_pending_by_prompt(prompt_id):
    c.execute("SELECT orig_comment_id, orig_author FROM pending WHERE prompt_id=?", (prompt_id,))
    row = c.fetchone()
    if row:
        orig_comment_id, orig_author = row
        c.execute("DELETE FROM pending WHERE prompt_id=?", (prompt_id,))
        conn.commit()
        return orig_comment_id, orig_author
    return None

def pop_pending_by_orig(orig_comment_id):
    c.execute("SELECT orig_comment_id, orig_author, prompt_id FROM pending WHERE orig_comment_id=?", (orig_comment_id,))
    row = c.fetchone()
    if row:
        orig_comment_id, orig_author, prompt_id = row
        c.execute("DELETE FROM pending WHERE orig_comment_id=?", (orig_comment_id,))
        conn.commit()
        return orig_comment_id, orig_author, prompt_id
    return None

def cleanup_expired_pending():
    now_ts = int(now_utc().timestamp())
    c.execute("DELETE FROM pending WHERE expires_at < ?", (now_ts,))
    conn.commit()

def build_link(path=UTM_BASE):
    sep = '&' if '?' in path else '?'
    return f"{path}{sep}utm_source=reddit-bot&utm_medium=comment&utm_campaign=reddit_alberta"

# ------- email notifications -------
def send_email_notification(subject, body, priority="normal"):
    """Send email notification if configured"""
    if not SEND_NOTIFICATIONS or not NOTIFY_EMAIL or not SMTP_USERNAME or not SMTP_PASSWORD:
        return False
    
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_USERNAME
        msg['To'] = NOTIFY_EMAIL
        msg['Subject'] = f"[Fabsy Bot] {subject}"
        
        if priority == "high":
            msg['X-Priority'] = '1'
            msg['X-MSMail-Priority'] = 'High'
        
        # Add timestamp and bot info to body
        full_body = f"{body}\n\n---\nBot: u/{USERNAME}\nTime: {now_utc().strftime('%Y-%m-%d %H:%M:%S UTC')}"
        
        msg.attach(MIMEText(full_body, 'plain'))
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
        
        logger.info("Email notification sent: %s", subject)
        return True
        
    except Exception as e:
        logger.error("Failed to send email notification: %s", e)
        return False

def notify_reply_posted(comment_id, subreddit, comment_url):
    """Notify when bot posts a reply"""
    if not NOTIFY_ON_REPLY:
        return
    
    subject = f"Bot replied in r/{subreddit}"
    body = f"""The bot posted a reply to a traffic ticket comment.

Comment ID: {comment_id}
Subreddit: r/{subreddit}
Comment URL: {comment_url}

This was an automated soft-ask prompt asking if they want the guide."""
    
    send_email_notification(subject, body)

def notify_full_reply_sent(comment_id, subreddit, orig_comment_url):
    """Notify when bot sends full reply with link after user says yes"""
    if not NOTIFY_ON_REPLY:
        return
    
    subject = f"Bot sent guide link in r/{subreddit} 🎯"
    body = f"""User said YES! Bot sent the full guide link.

Original comment: {orig_comment_url}
Subreddit: r/{subreddit}

This is a conversion - someone actually wanted the guide!"""
    
    send_email_notification(subject, body)

def notify_error(error_msg, comment_id=None, subreddit=None):
    """Notify about bot errors"""
    if not NOTIFY_ON_ERROR:
        return
    
    subject = "Bot Error Occurred"
    body = f"""The bot encountered an error:

Error: {error_msg}
"""
    
    if comment_id:
        body += f"Comment ID: {comment_id}\n"
    if subreddit:
        body += f"Subreddit: r/{subreddit}\n"
    
    send_email_notification(subject, body, priority="high")

def notify_moderation_action(action, subreddit, details):
    """Notify about potential moderation issues"""
    if not NOTIFY_ON_MODERATION:
        return
    
    subject = f"Moderation Alert: {action} in r/{subreddit}"
    body = f"""Potential moderation issue detected:

Action: {action}
Subreddit: r/{subreddit}
Details: {details}

You may want to check the subreddit and adjust bot behavior."""
    
    send_email_notification(subject, body, priority="high")

def notify_daily_summary():
    """Send daily summary of bot activity"""
    if not NOTIFY_ON_REPLY:
        return
    
    date = now_utc().strftime("%Y-%m-%d")
    
    # Get today's stats from database
    c.execute("SELECT subreddit, count FROM reply_log WHERE date=?", (date,))
    stats = c.fetchall()
    
    if not stats:
        return  # No activity today
    
    total_replies = sum(count for _, count in stats)
    
    subject = f"Daily Bot Summary - {total_replies} replies"
    body = f"""Daily bot activity summary for {date}:

Total replies: {total_replies}

By subreddit:"""
    
    for subreddit, count in stats:
        body += f"\n- r/{subreddit}: {count} replies"
    
    body += "\n\nRemember: These are soft-ask prompts. Users must reply 'yes' to get the actual guide link."
    
    send_email_notification(subject, body)

# safe reply with retries + incremental backoff
def safe_reply(thing, text, max_retries=5):
    for attempt in range(1, max_retries + 1):
        try:
            res = thing.reply(text)
            time.sleep(2)  # small pause after success
            return res
        except praw.exceptions.APIException as e:
            msg = str(e)
            logger.warning("APIException on reply (attempt %d): %s", attempt, msg)
            
            # Check for moderation-related issues
            if any(keyword in msg.upper() for keyword in ['BANNED', 'SUSPENDED', 'FORBIDDEN', 'UNAUTHORIZED']):
                subreddit_name = getattr(thing.subreddit, 'display_name', 'unknown') if hasattr(thing, 'subreddit') else 'unknown'
                notify_moderation_action("API Exception", subreddit_name, msg)
            
            if 'RATELIMIT' in msg.upper():
                # rudimentary parse: try to find number of minutes/seconds requested
                m = re.search(r'(\d+)\s*minutes?', msg, re.I)
                if m:
                    wait = int(m.group(1)) * 60
                else:
                    m2 = re.search(r'(\d+)\s*seconds?', msg, re.I)
                    wait = int(m2.group(1)) if m2 else 60 * attempt
                sleep_for = wait + random.randint(2, 6)
                logger.info("Rate limit detected, sleeping %ds", sleep_for)
                time.sleep(sleep_for)
                continue
            else:
                # other API errors: small backoff
                time.sleep(5 * attempt)
                continue
        except prawcore.exceptions.ServerError as e:
            logger.warning("ServerError on reply, sleeping 30s: %s", e)
            time.sleep(30)
        except Exception as e:
            logger.exception("Unexpected exception when posting reply: %s", e)
            time.sleep(10 * attempt)
    raise RuntimeError("Failed to reply after retries")

# reply templates
def generate_soft_prompt():
    return (
        "Hi — I'm Fabsy's automated helper for Alberta traffic tickets (disclosure: I work for fabsy.ca). "
        "I can share a short, free step-by-step guide that explains options and next steps. "
        "If you'd like the guide, reply here with **yes** or **link** and I'll send it. "
        "This is not legal advice."
    )

def generate_full_reply():
    return (
        "Here's the short guide we mentioned (free, general info — not legal advice):\n\n"
        f"{build_link()}\n\n"
        "If you want more tailored suggestions, reply here (no personal documents)."
    )

def should_reply(body):
    if not body:
        return False
    if KEYWORD_RE.search(body):
        if len(body.strip()) < 15:
            return False
        return True
    return False

# ------- main loop -------
def main():
    logger.info("Starting stream on: %s", SUBREDDITS)
    subreddit_stream = reddit.subreddit(SUBREDDITS)

    # clean old pending rows on startup
    cleanup_expired_pending()

    for comment in subreddit_stream.stream.comments(skip_existing=True):
        try:
            # basic filters
            if comment.author is None:
                continue
            author_name = str(comment.author)
            if author_name.lower() == USERNAME.lower():
                continue
            if has_replied(comment.id):
                continue

            # Is this comment a reply from the OP to our soft-prompt? -> check pending table
            parent_full = comment.parent_id  # e.g., "t1_xxx" or "t3_xxx"
            if parent_full.startswith("t1_"):
                parent_id = parent_full.split("_", 1)[1]
                pending = None
                # try match by prompt_id
                c.execute("SELECT orig_comment_id, orig_author FROM pending WHERE prompt_id=?", (parent_id,))
                row = c.fetchone()
                if row:
                    orig_comment_id, orig_author = row
                    # only accept confirmation if the replier is the original author
                    if author_name.lower() == orig_author.lower() and YES_RE.search(comment.body):
                        logger.info("Received YES from original author %s for orig %s", author_name, orig_comment_id)
                        # post the full guide reply and mark original as replied
                        # reply to the confirming comment with the link
                        full_text = generate_full_reply()
                        try:
                            safe_reply(comment, full_text)
                            mark_replied(orig_comment_id)
                            incr_today_count(comment.subreddit.display_name)
                            # Notify about successful conversion
                            comment_url = f"https://reddit.com{comment.permalink}"
                            notify_full_reply_sent(comment.id, comment.subreddit.display_name, comment_url)
                        except Exception as e:
                            logger.exception("Failed to post full reply after confirmation: %s", e)
                            notify_error(str(e), comment.id, comment.subreddit.display_name)
                        # remove pending
                        c.execute("DELETE FROM pending WHERE prompt_id=?", (parent_id,))
                        conn.commit()
                    else:
                        # either not the original author or not a yes; ignore
                        pass
                    continue  # continue main stream

            # Otherwise: check if the comment itself looks like it's asking about tickets
            if should_reply(comment.body):
                sub_name = comment.subreddit.display_name
                today_count = get_today_count(sub_name)
                if today_count >= MAX_REPLIES_PER_DAY:
                    logger.info("Skipping %s because daily limit reached for r/%s", comment.id, sub_name)
                    continue

                # soft-ask flow: ask whether they want the guide (no link yet)
                prompt_text = generate_soft_prompt()
                try:
                    prompt_comment = safe_reply(comment, prompt_text)
                    add_pending(comment.id, author_name, prompt_comment.id)
                    logger.info("Posted soft prompt %s in r/%s for orig %s", prompt_comment.id, sub_name, comment.id)
                    # note: we don't mark orig as replied yet; mark only after they confirm
                    incr_today_count(sub_name)
                    # Notify about soft prompt
                    comment_url = f"https://reddit.com{comment.permalink}"
                    notify_reply_posted(comment.id, sub_name, comment_url)
                    # small pause
                    time.sleep(5)
                except Exception as e:
                    logger.exception("Failed to post soft prompt for %s: %s", comment.id, e)
                    notify_error(str(e), comment.id, sub_name)
                    # continue
            # small sleep to avoid tight loop
            time.sleep(0.5)

        except Exception as exc:
            logger.exception("Stream error: %s", exc)
            time.sleep(10)


if __name__ == "__main__":
    main()
