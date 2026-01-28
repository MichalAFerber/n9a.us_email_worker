# Email to Discord Worker

A Cloudflare Email Worker that receives emails and forwards them to Discord channels via webhook, with Markdown formatting and file attachments. **Supports multiple domains routing to different Discord channels.**

## Features

- 📧 Parses incoming emails using `postal-mime`
- 📝 **Converts HTML to Markdown** using `turndown` for proper Discord formatting
- 📎 **Uploads attachments directly to Discord** in the same message
- 🖼️ **Embeds images** inline in the Discord message
- 📄 **Attaches full email as `email.txt`** for easy reading
- 🌐 **Multi-domain support** - route different domains to different Discord channels
- 📋 Displays From, To, CC, and Reply-To fields
- ✂️ Automatically truncates long content to fit Discord limits
- 🔄 Fallback handling for oversized attachments
- ⚠️ Error notifications sent to Discord

## Multi-Domain Setup

This worker supports routing emails from multiple domains to different Discord channels using a single deployment.

### How It Works

1. Email arrives at `anything@n9a.us` or `anything@ipcow.com`
2. Worker extracts the domain from the recipient address
3. Looks up the corresponding Discord webhook from `DOMAIN_WEBHOOKS`
4. Sends the formatted email to the correct Discord channel

### Configuration

Set a JSON object mapping domains to webhooks:

```json
{
  "n9a.us": "https://discord.com/api/webhooks/111/aaa",
  "ipcow.com": "https://discord.com/api/webhooks/222/bbb",
  "example.com": "https://discord.com/api/webhooks/333/ccc"
}
```

In Cloudflare Dashboard:
1. Go to **Workers & Pages** → `email-to-discord`
2. **Settings** → **Variables and Secrets**
3. Add secret `DOMAIN_WEBHOOKS` with the JSON above
4. Optionally add `DEFAULT_WEBHOOK_URL` as a fallback

## Prerequisites

- A Cloudflare account with your domains configured
- Email Routing enabled for each domain
- A Discord server with webhook URLs for each channel
- Node.js and npm installed locally

## Setup Instructions

### 1. Create Discord Webhooks

For each domain/channel:
1. Open Discord → go to the target channel
2. Click gear icon → Integrations → Webhooks
3. Click "New Webhook" and copy the URL
4. Repeat for each channel

### 2. Install & Deploy

```bash
cd email-to-discord-worker
npm install
npm run deploy
```

### 3. Configure Secrets

In Cloudflare Dashboard → Workers & Pages → `email-to-discord` → Settings → Variables and Secrets:

**Add `DOMAIN_WEBHOOKS`:**
```json
{"n9a.us":"https://discord.com/api/webhooks/...","ipcow.com":"https://discord.com/api/webhooks/..."}
```

**Optionally add `DEFAULT_WEBHOOK_URL`:**
```
https://discord.com/api/webhooks/...
```

### 4. Configure Email Routing

For **each domain** you want to route:

1. Go to Cloudflare Dashboard → select the domain
2. **Email** → **Email Routing** → Enable
3. **Routing rules** → Create address (or catch-all `*`)
4. Select **Send to a Worker** → choose `email-to-discord`
5. Save

Repeat for each domain (n9a.us, ipcow.com, etc.)

## Usage

Once configured:
- Emails to `*@n9a.us` → Discord channel for n9a.us
- Emails to `*@ipcow.com` → Discord channel for ipcow.com
- Emails to unmapped domains → `DEFAULT_WEBHOOK_URL` (if set) or rejected

## Discord Message Format

The Discord message includes:

- **Title**: Email subject with 📧 emoji
- **From**: Sender name and email address
- **To**: Recipient address(es)
- **CC**: Carbon copy recipients (if any)
- **Reply-To**: Reply address (if different from sender)
- **Body**: Email content converted to **Markdown**:
  - Bold, italic, links preserved
  - Lists formatted properly
  - Code blocks maintained
  - Headers converted to Discord format
- **Attachments**: All files uploaded and displayed:
  - Images embedded in the message
  - Other files downloadable
- **Timestamp**: When the email was received

## Attachment Handling

| Feature | Behavior |
|---------|----------|
| Images | First image is embedded in the embed, all images are attached |
| Files | Uploaded as Discord attachments (downloadable) |
| Size Limit | Files over 8MB are skipped (Discord's limit) |
| File Count | Maximum 10 files per message (Discord's limit) |
| Oversized Files | Listed as "skipped" in the attachment field |

## Customization

### Change the embed color

Edit `EMBED_COLOR` in `src/index.ts`:

```typescript
const EMBED_COLOR = 0x5865F2; // Discord blurple
```

Some common colors:
- `0x5865F2` - Discord Blurple
- `0x57F287` - Green
- `0xFEE75C` - Yellow
- `0xED4245` - Red
- `0xEB459E` - Fuchsia

### Change the bot username/avatar

Modify the webhook payload in `src/index.ts`:

```typescript
const payload: DiscordWebhookPayload = {
  username: 'My Custom Bot Name',
  avatar_url: 'https://example.com/avatar.png',
  embeds: [embed],
};
```

### Adjust file size limit (for boosted servers)

If your Discord server is boosted, you can increase the file size limit:

```typescript
// Level 2 boost = 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Level 3 boost = 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;
```

## Monitoring

View real-time logs:

```bash
npm run tail
```

Or check logs in the Cloudflare Dashboard:
1. Go to **Workers & Pages**
2. Select your `email-to-discord` worker
3. Click **Logs**

## Limits

| Limit | Value |
|-------|-------|
| Discord embed description | 4,096 characters |
| Discord field value | 1,024 characters |
| Discord embed title | 256 characters |
| Discord file size (default) | 8 MB |
| Discord files per message | 10 |
| Cloudflare email size limit | 25 MB |

Content exceeding these limits is automatically truncated or skipped.

## Troubleshooting

### Emails not appearing in Discord

1. Check the worker logs for errors: `npm run tail`
2. Verify the webhook URL is correctly set: `wrangler secret list`
3. Test the webhook directly with curl:
   ```bash
   curl -X POST "YOUR_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d '{"content": "Test message"}'
   ```

### Attachments not uploading

- Check if the file is under 8MB (or your server's limit)
- Verify you haven't exceeded 10 files per email
- Check logs for specific attachment errors

### Markdown not rendering correctly

- Some complex HTML may not convert perfectly
- Tables are simplified (Discord doesn't support full table markdown)
- Images in HTML are removed (uploaded as attachments instead)

### "Address not allowed" errors

Make sure Email Routing is properly enabled and the routing rule is active in Cloudflare Dashboard.

## License

[MIT](LICENSE)

build 20250127203259
