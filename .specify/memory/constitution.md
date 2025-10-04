# Fabsy Project Constitution

## Core Principles

### 1. User-Centric Design
- Every feature must provide clear value to Alberta drivers facing traffic violations
- User interfaces should be intuitive and accessible across all devices
- Content must be accurate, helpful, and legally sound for Alberta traffic law

### 2. Code Quality & Maintainability
- Use TypeScript for type safety and better developer experience
- Follow existing architectural patterns and component structure
- Write clean, readable code with proper documentation
- Maintain consistent code style using existing ESLint/Prettier configuration

### 3. Performance & SEO Excellence
- Optimize for fast loading times and smooth user experience
- Implement comprehensive SEO with proper meta tags, structured data, and semantic HTML
- Use efficient data fetching and caching strategies
- Ensure accessibility compliance (WCAG guidelines)

### 4. Data Integrity & Security
- Use Supabase Row Level Security (RLS) for all database operations
- Validate all user inputs on both client and server side
- Handle sensitive information (ticket details, personal data) with appropriate security measures
- Implement proper error handling and logging

### 5. Content Management Excellence
- Blog content should be comprehensive, accurate, and valuable for users
- Support rich markdown with tables, images, and proper formatting
- Maintain consistent content structure and SEO optimization
- Enable easy content updates through the admin interface

### 6. Testing & Quality Assurance
- Test all functionality across different browsers and devices
- Validate forms and user flows thoroughly
- Ensure backward compatibility when making changes
- Test SEO implementation and structured data

### 7. Development Process
- Use spec-driven development for new features
- Follow the constitution → specify → plan → tasks → implement workflow
- Maintain clear documentation for new features and APIs
- Commit frequently with clear, descriptive messages

## Technical Guidelines

### Frontend Standards
- Use React 18 with functional components and hooks
- Implement responsive design with Tailwind CSS
- Use shadcn/ui components for consistency
- Follow the existing component structure and naming conventions

### Backend Integration
- Use Supabase client with proper error handling
- Implement RLS policies for data security
- Use TypeScript types generated from Supabase schema
- Handle loading and error states consistently

### Styling Conventions
- Use Tailwind utility classes primarily
- Create reusable components for common UI patterns
- Maintain design system consistency
- Ensure mobile-first responsive design

## Decision-Making Framework

When evaluating new features or technical decisions:

1. **Does it serve Alberta drivers effectively?**
2. **Is it maintainable and follows our technical standards?**
3. **Does it maintain or improve performance and SEO?**
4. **Is it secure and handles data appropriately?**
5. **Does it integrate well with existing architecture?**

## Quality Gates

Before any feature is considered complete:

- [ ] Functionality tested across major browsers
- [ ] Mobile responsiveness verified
- [ ] SEO meta tags and structured data implemented
- [ ] TypeScript types properly defined
- [ ] Error handling implemented
- [ ] Loading states handled appropriately
- [ ] Accessibility considerations addressed
- [ ] Code follows existing patterns and style

This constitution serves as the foundation for all development decisions and should be referenced when creating specifications, plans, and implementations.