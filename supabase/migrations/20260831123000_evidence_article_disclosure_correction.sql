begin;

do $migration$
declare
  v_slug constant text := $slug$alberta-traffic-trial-evidence-self-represented$slug$;
  v_legacy_heading constant text := $legacy_heading$## 2. Disclosure must be requested and interpreted without legal advice from the Crown or police$legacy_heading$;
  v_safe_heading constant text := $safe_heading$## 2. Disclosure must be requested and reviewed before trial$safe_heading$;
  v_legacy_paragraph constant text := $legacy_paragraph$Disclosure may contain officer notes, witness statements, photographs, videos, certificates and other records. It helps you understand the prosecution’s case and prepare a response. The Crown prosecutor cannot give you legal advice or procedural tips; although a court clerk may be able to explain the process, the clerk cannot give legal advice either. You are responsible for working out what the materials mean for your defence.$legacy_paragraph$;
  v_safe_paragraph constant text := $safe_paragraph$After you or an authorized representative requests disclosure, the prosecutor must provide relevant, non-privileged material in the prosecution's possession or control. The disclosure duty is explained in [R. v. Stinchcombe, 1991 CanLII 45 (SCC)](https://www.canlii.org/en/ca/scc/doc/1991/1991canlii45/1991canlii45.html). The package varies by file and may include officer notes, witness statements, photographs, videos, certificates or other records. Additional device or maintenance records are not automatic and may require a focused request and justification. The prosecutor and police do not act for you or give legal advice. Court staff may provide general process information, but cannot tell you what the material means for your defence.$safe_paragraph$;
  v_target_count integer;
  v_legacy_heading_count integer;
  v_safe_heading_count integer;
  v_legacy_paragraph_count integer;
  v_safe_paragraph_count integer;
  v_changed_count integer;
  v_reviewed_at timestamptz;
begin
  select count(*)
    into v_target_count
    from public.blog_posts
   where slug = v_slug
     and status = 'published';

  if v_target_count <> 1 then
    raise exception 'Expected exactly one published evidence article; found %', v_target_count;
  end if;

  perform 1
    from public.blog_posts
   where slug = v_slug
     and status = 'published'
   for update;

  if not found then
    raise exception 'Published evidence article changed before it could be locked';
  end if;

  select
    (length(content) - length(replace(content, v_legacy_heading, ''))) / length(v_legacy_heading),
    (length(content) - length(replace(content, v_safe_heading, ''))) / length(v_safe_heading),
    (length(content) - length(replace(content, v_legacy_paragraph, ''))) / length(v_legacy_paragraph),
    (length(content) - length(replace(content, v_safe_paragraph, ''))) / length(v_safe_paragraph)
    into
      v_legacy_heading_count,
      v_safe_heading_count,
      v_legacy_paragraph_count,
      v_safe_paragraph_count
    from public.blog_posts
   where slug = v_slug
     and status = 'published';

  if v_legacy_heading_count = 1
     and v_legacy_paragraph_count = 1
     and v_safe_heading_count = 0
     and v_safe_paragraph_count = 0 then
    v_reviewed_at := clock_timestamp();

    update public.blog_posts
       set content = replace(
             replace(content, v_legacy_heading, v_safe_heading),
             v_legacy_paragraph,
             v_safe_paragraph
           ),
           updated_at = v_reviewed_at,
           reviewed_at = v_reviewed_at
     where slug = v_slug
       and status = 'published';

    get diagnostics v_changed_count = row_count;
    if v_changed_count <> 1 then
      raise exception 'Expected to update exactly one published evidence article; updated %', v_changed_count;
    end if;
  elsif v_legacy_heading_count = 0
        and v_legacy_paragraph_count = 0
        and v_safe_heading_count = 1
        and v_safe_paragraph_count = 1 then
    return;
  else
    raise exception 'Published evidence article disclosure copy does not match the reviewed legacy or corrected state';
  end if;
end
$migration$;

commit;
