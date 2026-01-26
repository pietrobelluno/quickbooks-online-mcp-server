# Project Progress

> This file tracks progress across sessions. Update before ending each session.
> **Keep this file under 400 lines** - archive old sessions to `.claude/session-archive/`

## Current Status
**Phase**: Development
**Last Updated**: 2026-01-26

---

### Session 4 (2026-01-26)
**Focus**: Remote MCP Connector fix - Added manifest endpoint & automatic token refresh
**Working On**: Issue with Claude Desktop Custom Connector not connecting (missing manifest endpoint)
**Branch**: feature/2-disable-data-heavy-tools
**Completed**:
- [x] **INFRASTRUCTURE CORRECTION**: Discovered duplicate deployments (App Runner vs ECS)
  - Found: App Runner `qbo-oauth-redirect` (obsolete, not connected to domain)
  - Found: ECS Fargate `quickbooks-mcp-cluster` (actual production, domain points here)
  - Deleted obsolete App Runner service
  - Updated qbo-deployment agent to use ECS Fargate (like Salesforce)
- [x] **CONNECTOR FIX**: Added missing `/.well-known/mcp.json` manifest endpoint
  - Required for Claude Desktop Custom Connector discovery
  - Deployed to ECS (commit b3f5fe3)
  - Verified live at https://quickbooks.gnarlysoft-mcp.com/.well-known/mcp.json
- [x] **TOKEN AUTO-REFRESH**: Implemented automatic token refresh in authorize endpoint
  - Changed from "only check sessions with >30 min validity" to "check ANY session and auto-refresh"
  - Uses existing TokenRefreshService to refresh expired tokens
  - Only redirects to QB OAuth if refresh fails (e.g., refresh token expired)
  - Session stays alive indefinitely via auto-refresh (commit f905381)
- [x] Deployed all fixes to ECS Fargate production
- [x] Updated documentation to reflect ECS architecture
**Blockers**: None
**Decisions**:
- **Deployment Platform**: Use ECS Fargate (not App Runner) - matches Salesforce architecture
- **Token Strategy**: Auto-refresh expired tokens instead of forcing re-authentication
- **Session Model**: ONE company session per realmId, shared by all users (QB best practice)
- **Connector Type**: Remote MCP Connector (not local MCP server in claude_desktop_config.json)
**Next**: Test Custom Connector connection in Claude Desktop, verify auto-refresh works

### Session 3 (2026-01-09)
**Focus**: Security fix, tool optimization, infrastructure correction & bug investigation
**Working On**: Multiple issues - Security (.env exposed), Issue #2 (disable data-heavy tools), Infrastructure (wrong ECR), Session persistence
**Branch**: feature/2-disable-data-heavy-tools
**Completed**:
- [x] **CRITICAL SECURITY FIX**: Removed .env from git tracking and history (exposed production credentials)
- [x] Rewrote entire git history using filter-branch to remove .env
- [x] Force-pushed all branches to GitHub to remove sensitive data
- [x] Added comprehensive .gitignore for sensitive files
- [x] Created GitHub issue #2 for tool optimization
- [x] Disabled 52 data-heavy tools (Search/Get/Create/Update/Delete)
- [x] Kept only QueryReports tool active (prevents Claude Desktop hanging)
- [x] Updated README.md with active/disabled tools documentation
- [x] Built and deployed fix to production (commit 1e81eb7)
- [x] **INFRASTRUCTURE FIX**: Corrected ECR repository references
  - Changed from `qbo-oauth-redirect` to `quickbooks-mcp-server`
  - Updated App Runner service to use correct ECR
  - Built and pushed AMD64 Docker image (fixed "exec format error")
  - Deleted obsolete `qbo-oauth-redirect` ECR repository
- [x] Fixed session persistence bug (immediate S3 saves, no debounce)
- [x] Updated AWS_DEPLOYMENT.md and qbo-deployment agent docs
- [x] Deployed all fixes to production successfully
- [x] Investigated authentication bug (token expiration, needs reconnect)
**Blockers**: None
**Decisions**:
- **Security**: NEVER commit .env files, use .gitignore, rotate compromised credentials
- **Tool Strategy**: Disable all except QueryReports to prevent context overflow
- **ECR Naming**: Use `quickbooks-mcp-server` as canonical repository name
- **Docker**: Build for AMD64 architecture (App Runner requirement)
- **Session Storage**: Immediate S3 saves (no debounce) for reliability
**Next**: Test QueryReports tool, verify multi-user session sharing, rotate QB credentials

### Session 2 (2026-01-07)
**Focus**: Multi-user session management - Prevent QB admin replacement & AWS deployment
**Working On**: Issue #1 - Prevent QuickBooks admin replacement when multiple users connect
**Branch**: feature/1-prevent-admin-replacement
**Completed**:
- [x] Generated workflow agents and skills for QBO MCP server (backend, integration, infra, reviewer)
- [x] Created GitHub issue #1 for multi-user session management
- [x] Researched Claude Desktop MCP OAuth flow and QuickBooks multi-user patterns
- [x] Created implementation plan (saved to `.claude/plans/`)
- [x] Implemented SessionLockManager for race condition prevention (`src/utils/session-lock.ts`)
- [x] Added getActiveCompanySession() method to session storage
- [x] Enhanced authorize endpoint with mutex locking and early-exit logic
- [x] Added userId, userEmail, sharedWith fields to QuickBooksSession interface
- [x] Built and tested implementation (TypeScript compilation successful)
- [x] Deployed to AWS App Runner via ECR (commit e9ca737)
- [x] Verified deployment health check: ✅ HEALTHY at https://quickbooks.gnarlysoft-mcp.com
- [x] Created AWS_DEPLOYMENT.md documentation (complete deployment guide)
- [x] Generated qbo-deployment agent and /deploy skill for future deployments
- [x] Updated workflow.json with deployment scope and agent
**Blockers**: None
**Decisions**:
- Use mutex locking to prevent race conditions during OAuth
- Skip QuickBooks OAuth entirely when valid session exists (>30 min validity)
- Share QB tokens across users but keep MCP tokens isolated per Claude Desktop instance
- Deploy directly to production (quickbooks-mcp-alb) - fix is live
**Next**: Test multi-user connection flow with multiple Claude Desktop instances in production

### Session 1 (2026-01-07)
**Focus**: Project initialization
**Completed**:
- Created workflow configuration
- Set up progress tracking
**Next**: Run /wf-generate to create agents and skills

---

## Session Archive

> When this file exceeds 500 lines, move older sessions to `.claude/session-archive/sessions-{N}-{M}.md`
> Keep only the last 5 sessions in this file for AI readability.

## In Progress
- Testing Remote MCP Connector with auto-refresh in Claude Desktop

## Next Session Should
- [ ] **URGENT**: Rotate QuickBooks production credentials (Client ID and Secret were exposed on GitHub)
- [ ] Test Custom Connector connection in Claude Desktop (https://quickbooks.gnarlysoft-mcp.com)
- [ ] Verify automatic token refresh works (check logs for "Successfully refreshed QuickBooks tokens")
- [ ] Test multi-user session sharing (User A connects, User B should reuse session without QB OAuth)
- [ ] Test QueryReports tool functionality in Claude Desktop
- [ ] Consider merging feature/2-disable-data-heavy-tools to main
- [ ] Close issue #2 if testing successful
- [ ] Update issue #1 with multi-user test results

## Decisions Made
- **Multi-User Session Strategy**: Mutex + early-exit pattern to prevent duplicate OAuth flows
- **Token Sharing**: QB tokens shared across users (safe: company-level tokens), MCP tokens isolated per user
- **Deployment**: ECS Fargate on `quickbooks-mcp-cluster` (NOT App Runner) - matches Salesforce
- **Agent Structure**: 5 specialized agents (backend, integration, infra, deployment, reviewer)
- **Security**: All sensitive files in .gitignore, git history cleaned, credentials must be rotated
- **Tool Strategy**: Only QueryReports enabled (52 tools disabled) to prevent Claude hanging
- **Infrastructure**: ECR `quickbooks-mcp-server` is canonical, App Runner deleted (obsolete)
- **Session Persistence**: Immediate S3 saves (no debounce) for critical data
- **Token Refresh**: Auto-refresh expired tokens in authorize endpoint (session lives indefinitely)

## Notes
- Production URL: https://quickbooks.gnarlysoft-mcp.com
- AWS Account: 700633997241 (launchpad-mcp-devops profile)
- Deployment: ECS Fargate cluster `quickbooks-mcp-cluster`, service `quickbooks-mcp-service`
- Session storage: S3 bucket `quickbooks-mcp-sessions`
- Latest deployment: commit f905381 (auto-refresh + manifest endpoint)
- ECR Repository: `quickbooks-mcp-server` (AMD64 images)
- Architecture: Domain → ALB `quickbooks-mcp-alb` → ECS Fargate
