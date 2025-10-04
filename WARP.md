# WARP Project Rule - Fabsy Traffic Ticket Defense

## Project Context
This is a **spec-driven development** project using GitHub's Spec-Kit framework for structured AI-assisted development. The application is a React/TypeScript traffic ticket defense service for Alberta, Canada.

## 🚀 Quick Start Commands

### Development Server
```bash
npm run dev
# Serves on http://localhost:8080+ (auto-finds available port)
```

### Build & Deploy
```bash
npm run build    # Production build with pre/post build scripts
git push origin main  # Auto-deploys via Lovable
```

## 🛠️ Spec-Driven Development Workflow

This project uses **structured development** with AI agents. When adding new features, follow this process:

### 1. Project Constitution (Already Established)
The project constitution is at `.specify/memory/constitution.md` - review it before starting new features.

### 2. Spec-Driven Feature Development Process
For any new feature development with Claude Code or other AI agents:

```bash
# 1. Establish feature-specific principles
/constitution Create principles for [feature name] focusing on [specific requirements]

# 2. Define what you want to build
/specify Build [detailed description of feature requirements and user stories]

# 3. Clarify ambiguous areas (optional but recommended)
/clarify

# 4. Create technical implementation plan
/plan Use React 18, TypeScript, Tailwind CSS, Supabase, following existing patterns

# 5. Generate actionable tasks
/tasks

# 6. Analyze consistency (optional)
/analyze

# 7. Execute implementation
/implement
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
- **Deployment**: Lovable (auto-deploy from git main branch)

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
- **Automatic**: Push to `main` branch triggers Lovable deployment
- **Manual**: Check Lovable dashboard if auto-deploy doesn't trigger
- **Local Testing**: Always test with `npm run dev` before pushing

### Spec-Kit Framework Files
- `.specify/memory/constitution.md` - Project principles and guidelines
- `.specify/templates/` - Development templates for specs, plans, tasks
- `.specify/scripts/` - Automation scripts for the development workflow
- `CLAUDE.md` - AI agent configuration and command reference

## 💡 Best Practices for This Project

1. **Start with Constitution** - Always reference the project constitution before adding features
2. **Use Spec-Driven Process** - Follow the structured workflow for consistent, high-quality development
3. **Maintain SEO Focus** - Alberta traffic law content should be search-optimized and user-focused
4. **Test Thoroughly** - Traffic ticket handling requires reliable, error-free functionality
5. **Document Decisions** - Use the spec-kit templates to document feature specifications and plans

## 🎓 Learning Resources

- **Spec-Kit Documentation**: [GitHub Spec-Kit Repository](https://github.com/github/spec-kit)
- **Project Constitution**: `.specify/memory/constitution.md`
- **Claude Configuration**: `CLAUDE.md`

This project is optimized for AI-assisted development using structured, spec-driven approaches that ensure high code quality and consistent user experiences.