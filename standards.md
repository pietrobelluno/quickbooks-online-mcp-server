# Code Standards

> This file contains coding standards for the project.
> Stack-specific conventions will be added by `/wf-generate`.

## General

- Follow existing patterns in the codebase
- Write tests for new functionality
- Keep functions focused and small
- Prefer explicit over implicit
- Document non-obvious decisions

## Commits

Use conventional commits: `type(scope): description`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `docs`: Documentation only
- `test`: Adding/updating tests
- `chore`: Build, config, dependencies
- `style`: Formatting, whitespace

**Examples**:
```
feat(auth): add password reset flow
fix(api): handle null response from external service
refactor(users): extract validation logic
```

## Code Style

### TypeScript/Node.js

- Use TypeScript strict mode
- Prefer `const` over `let`, avoid `var`
- Use async/await over callbacks
- Export types from dedicated files or inline
- Use ES modules (`import/export`) not CommonJS
- Follow existing ESLint and Prettier configurations
- Use Zod for runtime validation and schema definition
- Prefer descriptive variable names over abbreviations

### MCP Server Patterns

- Keep tool handlers focused and single-purpose
- Validate all inputs with Zod schemas
- Return structured error messages
- Use proper MCP SDK types and patterns
- Document tool parameters and return types

### QuickBooks Integration

- Handle OAuth token refresh gracefully
- Check realm ID before API calls
- Wrap QuickBooks SDK calls with proper error handling
- Log API errors with context
- Use environment variables for all credentials

## Testing

- Write unit tests for business logic
- Test error handling paths
- Mock QuickBooks API calls in tests
- Run tests with: `npm test` (when configured)
- Run linting: `npm run lint`
- Fix lint issues: `npm run lint:fix`

## File Organization

```
src/
├── index.ts              # STDIO MCP server entry
├── index-http.ts         # HTTP MCP server entry
├── auth-server.ts        # OAuth flow handler
├── tools/                # MCP tool implementations
├── schemas/              # Zod validation schemas
└── utils/                # Shared utilities

.env                      # Local credentials (gitignored)
Dockerfile                # Container configuration
```

## Environment Variables

Required for all environments:
- `QUICKBOOKS_CLIENT_ID` - OAuth client ID
- `QUICKBOOKS_CLIENT_SECRET` - OAuth client secret
- `QUICKBOOKS_ENVIRONMENT` - `sandbox` or `production`
- `QUICKBOOKS_REFRESH_TOKEN` - OAuth refresh token
- `QUICKBOOKS_REALM_ID` - Company/realm identifier

## Build and Run

```bash
npm run build          # Compile TypeScript
npm run watch          # Watch mode for development
npm run lint           # Check code style
npm run lint:fix       # Auto-fix lint issues
npm run auth           # Run OAuth flow
npm run start:stdio    # Start STDIO server
npm run start:http     # Start HTTP server
```
