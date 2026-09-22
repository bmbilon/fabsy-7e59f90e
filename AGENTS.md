# Codex Configuration - Fabsy Traffic Ticket Defense

## Reusable consent and payment links

- When Brett asks for a consent and/or payment link, use the permanent public links: `https://fabsy.ca/checkout` (both), `https://fabsy.ca/consent` (consent only), or `https://fabsy.ca/payment` (payment only).
- These pages collect the customer's name, email, standard service selection, and applicable authorization/payment. Tickets may be uploaded or emailed using the same email.
- Do not create a client-specific page, private link, case record, or deployment for an ordinary link request. Use the existing universal page. Older private links remain supported for existing cases.

## Project Overview
This is a React/TypeScript application for traffic ticket defense services in Alberta, Canada. The application includes:

- **Blog functionality** with full markdown support and SEO optimization
- **Ticket submission and analysis** features
- **Admin dashboard** for managing submissions and blog content
- **Supabase backend** for data persistence
- **Tailwind CSS** for styling

## Available Slash Commands

Use these commands for structured development with Codex:

### `/constitution`
Create or update project governing principles and development guidelines that guide technical decisions and implementation choices.

### `/specify` 
Define what you want to build (requirements and user stories). Focus on the "what" and "why", not the tech stack.

### `/clarify`
Clarify underspecified areas through structured questioning. Must be run before `/plan` unless explicitly skipped.

### `/plan`
Create technical implementation plans with your chosen tech stack and architecture decisions.

### `/tasks`
Generate actionable task lists for implementation based on your plan.

### `/analyze`
Cross-artifact consistency & coverage analysis. Run after `/tasks`, before `/implement`.

### `/implement`
Execute all tasks to build the feature according to the plan.

## Current Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS with shadcn/ui components
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Deployment**: Lovable (auto-deploy from git)
- **Blog**: ReactMarkdown with remark-gfm for rich content
- **SEO**: React Helmet Async for meta tags and structured data

## Project Structure

```
src/
├── components/        # Reusable UI components
├── pages/            # Page components and routes
├── integrations/     # Supabase client and types
├── hooks/           # Custom React hooks
└── lib/             # Utility functions

.specify/
├── scripts/         # Automation scripts
├── templates/       # Spec-driven development templates
└── memory/          # Project constitution and guidelines
```

## Development Guidelines

1. **Follow existing patterns** - Maintain consistency with current codebase structure
2. **Use TypeScript** - Ensure type safety throughout the application  
3. **Leverage Tailwind** - Use existing utility classes and design system
4. **Test thoroughly** - Ensure functionality works across different devices/browsers
5. **SEO-first** - Include proper meta tags and structured data for new pages
6. **Supabase integration** - Use existing client patterns for data operations

## Next Feature Development

When developing new features, use the spec-driven development process:

1. Start with `/constitution` to establish feature-specific principles
2. Use `/specify` to define requirements clearly
3. Use `/clarify` to resolve any ambiguous areas
4. Create technical plan with `/plan`
5. Break down into tasks with `/tasks`
6. Analyze consistency with `/analyze`
7. Execute implementation with `/implement`

This ensures high-quality, consistent feature development aligned with the existing codebase.
