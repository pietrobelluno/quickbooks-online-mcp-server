# AWS Deployment Guide

This guide covers deploying the QuickBooks MCP Server to AWS App Runner.

## Infrastructure Overview

- **AWS Account**: 700633997241
- **Region**: us-east-1
- **App Runner Service**: qbo-oauth-redirect (name unchanged, but uses correct ECR)
- **ECR Repository**: 700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server
- **Load Balancer**: quickbooks-mcp-alb
- **Public URL**: https://quickbooks.gnarlysoft-mcp.com
- **S3 Bucket**: quickbooks-mcp-sessions (for token storage)

## Prerequisites

1. **AWS SSO Access**: Configure AWS CLI with SSO profile
2. **Docker**: Installed and running locally
3. **Git**: Latest changes committed to branch

## Deployment Steps

### 1. AWS SSO Login

```bash
aws sso login --profile launchpad-mcp-devops
```

This will open your browser for authentication. Once completed, you'll have temporary AWS credentials.

### 2. Build Docker Image

```bash
# Build the Docker image locally
docker build -t quickbooks-mcp-server:latest .
```

The build process:
- Uses multi-stage build for optimization
- Compiles TypeScript to JavaScript
- Installs production dependencies only
- Creates final image ~150MB

### 3. Login to ECR

```bash
export AWS_PROFILE=launchpad-mcp-devops
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 700633997241.dkr.ecr.us-east-1.amazonaws.com
```

### 4. Tag and Push Image

```bash
# Tag with latest
docker tag quickbooks-mcp-server:latest 700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:latest

# Tag with git commit hash (for versioning)
docker tag quickbooks-mcp-server:latest 700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:$(git rev-parse --short HEAD)

# Push both tags
docker push 700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:latest
docker push 700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:$(git rev-parse --short HEAD)
```

### 5. Update App Runner Service

```bash
export AWS_PROFILE=launchpad-mcp-devops

aws apprunner update-service \
  --service-arn "arn:aws:apprunner:us-east-1:700633997241:service/qbo-oauth-redirect/f7b28bd2c0f24d0ea9889bb7f54d15c0" \
  --source-configuration "ImageRepository={ImageIdentifier=700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:latest,ImageRepositoryType=ECR,ImageConfiguration={Port=8080}}"
```

App Runner will automatically:
- Pull the new image from ECR
- Start new instances
- Health check the new deployment
- Route traffic to new instances
- Terminate old instances

**Deployment time**: ~3-5 minutes

### 6. Verify Deployment

#### Check Service Status
```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-1:700633997241:service/qbo-oauth-redirect/f7b28bd2c0f24d0ea9889bb7f54d15c0" \
  --query "Service.{ServiceName:ServiceName,Status:Status,ServiceUrl:ServiceUrl}" \
  --output table
```

Expected output:
```
Status: RUNNING
```

#### Check Health Endpoint
```bash
curl https://quickbooks.gnarlysoft-mcp.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "server": "QuickBooks MCP Server"
}
```

#### View Recent Logs
```bash
aws logs tail /aws/apprunner/qbo-oauth-redirect/f7b28bd2c0f24d0ea9889bb7f54d15c0/application --since 5m --follow
```

Look for:
- Server startup messages
- No error logs
- Successful health checks

### 7. Monitor Deployment Operations

```bash
aws apprunner list-operations \
  --service-arn "arn:aws:apprunner:us-east-1:700633997241:service/qbo-oauth-redirect/f7b28bd2c0f24d0ea9889bb7f54d15c0" \
  --max-results 5
```

Check that latest operation shows:
- Type: `UPDATE_SERVICE`
- Status: `SUCCEEDED`

## Rollback

If deployment fails, App Runner automatically rolls back to the previous working version.

To manually rollback to a specific version:

```bash
# List image tags
aws ecr list-images --repository-name quickbooks-mcp-server --query 'imageIds[*].imageTag' --output table

# Deploy specific version
aws apprunner update-service \
  --service-arn "arn:aws:apprunner:us-east-1:700633997241:service/qbo-oauth-redirect/f7b28bd2c0f24d0ea9889bb7f54d15c0" \
  --source-configuration "ImageRepository={ImageIdentifier=700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:<commit-hash>,ImageRepositoryType=ECR,ImageConfiguration={Port=8080}}"
```

## Environment Variables

These are configured in App Runner service settings (not in code):

- `AWS_REGION`: us-east-1
- `NODE_ENV`: production
- `PORT`: 8080
- `QUICKBOOKS_CLIENT_ID`: (configured in AWS)
- `QUICKBOOKS_CLIENT_SECRET`: (configured in AWS)
- `QUICKBOOKS_ENVIRONMENT`: production
- `QUICKBOOKS_REDIRECT_URI`: https://quickbooks.gnarlysoft-mcp.com/oauth/callback
- `S3_STORAGE_BUCKET`: quickbooks-mcp-sessions
- `USE_S3_STORAGE`: true

To update environment variables:
```bash
aws apprunner update-service \
  --service-arn "..." \
  --source-configuration "ImageRepository={...,ImageConfiguration={Port=8080,RuntimeEnvironmentVariables={KEY=VALUE}}}"
```

## Troubleshooting

### Deployment Fails with Health Check Errors
- Check logs: `aws logs tail /aws/apprunner/.../application`
- Verify environment variables are set correctly
- Ensure port 8080 is exposed in Dockerfile
- Check S3 bucket permissions

### "Unable to pull image from ECR"
- Verify ECR login: `aws ecr get-login-password`
- Check IAM role: `AppRunnerECRAccessRole` has ECR read permissions
- Confirm image exists: `aws ecr describe-images --repository-name quickbooks-mcp-server`

### Service Shows "RUNNING" but Health Check Fails
- Check health endpoint directly: `curl https://quickbooks.gnarlysoft-mcp.com/health`
- Verify ALB target group health checks
- Check CloudWatch Logs for errors

### S3 Session Storage Issues
- Verify IAM role: `AppRunnerInstanceRole` has S3 read/write permissions for `quickbooks-mcp-sessions` bucket
- Check bucket exists: `aws s3 ls s3://quickbooks-mcp-sessions/`
- Verify `USE_S3_STORAGE=true` environment variable

## Quick Deployment Script

Save this as `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Deploying QuickBooks MCP Server to AWS..."

# Set AWS profile
export AWS_PROFILE=launchpad-mcp-devops

# Get git commit hash
GIT_HASH=$(git rev-parse --short HEAD)

echo "📦 Building Docker image..."
docker build -t quickbooks-mcp-server:latest .

echo "🔐 Logging into ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 700633997241.dkr.ecr.us-east-1.amazonaws.com

echo "🏷️  Tagging images..."
docker tag quickbooks-mcp-server:latest 700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:latest
docker tag quickbooks-mcp-server:latest 700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:$GIT_HASH

echo "📤 Pushing to ECR..."
docker push 700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:latest
docker push 700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:$GIT_HASH

echo "🔄 Updating App Runner service..."
aws apprunner update-service \
  --service-arn "arn:aws:apprunner:us-east-1:700633997241:service/qbo-oauth-redirect/f7b28bd2c0f24d0ea9889bb7f54d15c0" \
  --source-configuration "ImageRepository={ImageIdentifier=700633997241.dkr.ecr.us-east-1.amazonaws.com/quickbooks-mcp-server:latest,ImageRepositoryType=ECR,ImageConfiguration={Port=8080}}"

echo "⏳ Waiting for deployment to complete..."
sleep 60

echo "✅ Checking health..."
curl -s https://quickbooks.gnarlysoft-mcp.com/health

echo ""
echo "🎉 Deployment complete!"
echo "📊 View logs: aws logs tail /aws/apprunner/qbo-oauth-redirect/f7b28bd2c0f24d0ea9889bb7f54d15c0/application --follow"
```

Make executable:
```bash
chmod +x deploy.sh
./deploy.sh
```

## Post-Deployment Testing

Test the multi-user session management fix:

1. **User A**: Connect via Claude Desktop
   - Should see QuickBooks OAuth
   - Becomes admin

2. **User B**: Connect via Claude Desktop (different instance)
   - Should NOT see QuickBooks OAuth
   - Automatically uses User A's connection
   - User A remains admin (no replacement)

3. **Verify Logs**:
   ```bash
   aws logs tail /aws/apprunner/.../application --follow
   ```

   Look for:
   ```
   → Checking for existing company connection...
   ✓ Found active company connection (realmId: ...)
   ✓ Tokens valid - skipping QuickBooks OAuth to prevent admin replacement
   ```

## Monitoring

- **CloudWatch Logs**: `/aws/apprunner/qbo-oauth-redirect/f7b28bd2c0f24d0ea9889bb7f54d15c0/application`
- **CloudWatch Metrics**: App Runner service metrics (CPU, Memory, Requests)
- **Health Endpoint**: https://quickbooks.gnarlysoft-mcp.com/health
- **S3 Session Storage**: s3://quickbooks-mcp-sessions/data/

## Cost Optimization

App Runner charges:
- **Provisioned instances**: $0.007/GB-hour for memory, $0.064/vCPU-hour
- **Current config**: 1 vCPU, 2 GB RAM
- **Estimated cost**: ~$50-100/month depending on usage

To reduce costs:
- Scale down CPU/memory if not needed
- Enable auto-scaling to scale to zero during idle periods
