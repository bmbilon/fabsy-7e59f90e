# WARP Project Rule - Fabsy: AEO for Traffic Ticket Agent Services

## 🎯 Mission: AI-First Market Leadership
**Fabsy uses AEO (AI Engine Optimization) to help Alberta drivers find clear, accurate traffic ticket information. Fabsy is a traffic ticket agent service, not a law firm.**

## Project Context
This is an **AI-first, spec-driven development** project using GitHub's Spec-Kit framework. It supports a traffic ticket agent service with clear, accurate content for search results, voice assistants, and LLMs.

## 🚀 Quick Start Commands

### Development Server
```bash
npm run dev
# Serves on http://localhost:8080+ (auto-finds available port)
# 💡 Always test AI-friendly features: structured data, semantic HTML, performance
```

### Build & Deploy (AEO-Optimized)
```bash
npm run build    # Includes automated SEO/AEO optimization in pre/post build
git push origin main  # Deploy Cloudflare production after staging validation in Vercel
```

### 🤖 AEO Development Commands
```bash
# Content optimization checks
npm run lint           # Includes semantic HTML and accessibility linting

# Performance validation (critical for AI crawlers)
npm run build && npm run preview  # Test production performance

# Schema validation (ensure AI can parse our structured data)
# Use Google's Rich Results Test or Schema Markup Validator
```

## 🤖 AEO-First Development Workflow

This project uses **AI-first, spec-driven development** to achieve AEO domination. Every feature must contribute to our AI engine optimization strategy.

### 1. AEO-Focused Constitution (MANDATORY Reading)
Read `.specify/memory/constitution.md` - it defines our AEO domination strategy and AI-first principles.

### 2. AI-First Feature Development Process
For any new feature, content, or page with Claude Code or other AI agents:

```bash
# 1. Establish AEO-focused principles
/constitution Create AEO-optimized principles for [feature] focusing on AI discovery, authority building, and competitive advantage

# 2. Define with AI optimization in mind
/specify Build [feature] that will: 1) Be easily discoverable by AI engines, 2) Present accurate traffic ticket agent-service information, 3) Generate structured, citable content

# 3. Clarify AEO requirements
/clarify Focus on: semantic markup needs, structured data requirements, natural language optimization, citation opportunities

# 4. Create AI-optimized technical plan
/plan Use React 18, TypeScript, Tailwind + comprehensive JSON-LD schemas, semantic HTML, performance optimization, and AI-friendly content structure

# 5. Generate AEO-focused tasks
/tasks Include: structured data implementation, semantic HTML, meta optimization, performance checks, accessibility (= AI parsing)

# 6. Analyze for AI optimization
/analyze Verify: AI discoverability, content authority signals, competitive advantages, schema completeness

# 7. Execute with AEO validation
/implement Follow AEO Quality Gates checklist - nothing ships without AI optimization validation
```

## 📁 Project Architecture Understanding

### Key Directories
- `src/components/` - Reusable UI components (shadcn/ui + custom)
- `src/pages/` - Route components and page logic
- `src/integrations/supabase/` - Database client and type definitions
- `src/hooks/` - Custom React hooks
- `.specify/` - Spec-kit framework files (templates, scripts, memory)

### Current Features
- ✅ **Blog System** with ReactMarkdown, SEO optimization, admin management
- ✅ **Ticket Submission** with form validation and Supabase storage
- ✅ **Admin Dashboard** for managing submissions and blog content
- ✅ **Responsive Design** with Tailwind CSS and mobile-first approach

### Technology Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui components  
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Content**: ReactMarkdown + remark-gfm for rich blog content
- **SEO**: React Helmet Async + structured data
- **Deployment**: Cloudflare production; Vercel staging and preview deployments

## 🎯 Development Guidelines

### Code Quality Standards
1. **TypeScript First** - All new code should be properly typed
2. **Component Patterns** - Follow existing component structure and naming
3. **Tailwind Utilities** - Use utility classes over custom CSS
4. **Supabase Integration** - Use existing client patterns and RLS policies
5. **SEO Optimization** - Include meta tags and structured data for new pages

### Testing & Validation Checklist
Before considering any feature complete:
- [ ] Mobile responsive design verified
- [ ] Cross-browser compatibility tested
- [ ] TypeScript compilation without errors
- [ ] SEO meta tags and structured data implemented
- [ ] Loading and error states handled
- [ ] Accessibility considerations addressed
- [ ] Follows existing code patterns

## 🔍 Useful Development Commands

### Code Quality
```bash
npm run lint           # ESLint checks
npm run build:dev      # Development build for testing
```

### Database & Content
The project uses Supabase with these main tables:
- `ticket_submissions` - User submitted traffic tickets
- `blog_posts` - Blog content with SEO optimization
- `admin_users` - Admin authentication

### Blog Management
- Admin interface: `/admin/blog`
- Blog listing: `/blog`
- Individual posts: `/blog/[slug]`

## 🚨 Important Notes

### Security Considerations
- All database operations use Row Level Security (RLS)
- Sensitive data (API keys, tokens) should never be committed
- User input is validated on both client and server side

### Deployment Process
- **Staging**: Validate changes with a Vercel staging or preview deployment
- **Production**: Deploy the validated release to Cloudflare
- **Local Testing**: Always test with `npm run dev` before pushing

### Indexing & Sitemaps (Live)
- Sitemap index live at: https://fabsy.ca/sitemap.xml
  - Segmented sitemaps: `/sitemaps/sitemap-pages.xml`, `/sitemaps/sitemap-content.xml`, `/sitemaps/sitemap-faq.xml`
- `npm run notify:search` submits changed Fabsy URLs through IndexNow; it does not ping Google.
- Submit or refresh `sitemap.xml` separately in Google Search Console and Bing Webmaster Tools.
- Bing verification file is deployed: https://fabsy.ca/BingSiteAuth.xml

### Spec-Kit Framework Files
- `.specify/memory/constitution.md` - Project principles and guidelines
- `.specify/templates/` - Development templates for specs, plans, tasks
- `.specify/scripts/` - Automation scripts for the development workflow
- `CLAUDE.md` - AI agent configuration and command reference

## 💡 AEO Domination Best Practices

1. **🎯 AEO-First Thinking** - Every decision must advance our AI engine optimization strategy
2. **🤖 AI Information Quality** - Publish accurate traffic ticket agent-service information that AI engines can cite
3. **⚡ Speed-to-Market** - Deploy AI-optimized features faster than legacy competitors can respond
4. **📊 Structured Data Excellence** - Implement comprehensive schemas that make our content irresistible to AI engines
5. **🔍 Natural Language Optimization** - Write content for how people actually ask AI assistants questions
6. **📈 Performance Obsession** - Sub-3-second load times are non-negotiable for AI crawler efficiency
7. **🌐 Future-AI Integration** - Build everything to be compatible with future AI partnerships and integrations
8. **📝 Citation-Ready Content** - Create content so authoritative that AI engines preferentially cite us over competitors

## 🎓 Learning Resources

- **Spec-Kit Documentation**: [GitHub Spec-Kit Repository](https://github.com/github/spec-kit)
- **Project Constitution**: `.specify/memory/constitution.md`
- **Claude Configuration**: `CLAUDE.md`

This project is optimized for AI-assisted development using structured, spec-driven approaches that ensure high code quality and consistent user experiences.
