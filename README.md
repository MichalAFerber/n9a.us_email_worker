# Email to Discord Worker

A Cloudflare Email Worker that receives emails at `junk@n9a.us` and forwards them to a Discord channel via webhook, with Markdown formatting and file attachments.

## Features

- 📧 Parses incoming emails using `postal-mime`
- 📝 **Converts HTML to Markdown** using `turndown` for proper Discord formatting
- 📎 **Uploads attachments directly to Discord** in the same message
- 🖼️ **Embeds images** inline in the Discord message
- 📋 Displays From, To, CC, and Reply-To fields
- ✂️ Automatically truncates long content to fit Discord limits
- 🔄 Fallback handling for oversized attachments
- ⚠️ Error notifications sent to Discord

## How It Works

1. Email arrives at `junk@n9a.us`
2. Cloudflare Email Routing triggers the worker
3. Worker parses the email (headers, body, attachments)
4. HTML content is converted to Discord-compatible Markdown
5. Attachments are uploaded via multipart/form-data
6. Everything is sent to Discord in a single message

## Prerequisites

- A Cloudflare account with the domain `n9a.us` configured
- Email Routing enabled for your domain
- A Discord server with a channel and webhook URL
- Node.js and npm installed locally

## Setup Instructions

### 1. Create a Discord Webhook

1. Open Discord and go to the channel where you want to receive emails
2. Click the gear icon (Edit Channel) → Integrations → Webhooks
3. Click "New Webhook"
4. Give it a name (e.g., "Email Bot")
5. Copy the webhook URL - you'll need this later

### 2. Install Dependencies

```bash
cd email-to-discord-worker
npm install
```

### 3. Configure the Worker Secret

Set your Discord webhook URL as a secret:

```bash
npx wrangler secret put DISCORD_WEBHOOK_URL
```

When prompted, paste your Discord webhook URL (it looks like `https://discord.com/api/webhooks/...`).

### 4. Deploy the Worker

```bash
npm run deploy
```

### 5. Configure Email Routing in Cloudflare

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain (`n9a.us`)
3. Go to **Email** → **Email Routing**
4. Make sure Email Routing is enabled
5. Go to the **Email Workers** tab
6. Click **Create** and select your deployed `email-to-discord` worker
7. Go back to **Routing rules** tab
8. Click **Create address**
9. Enter `junk` as the custom address
10. Select **Send to a Worker** and choose your `email-to-discord` worker
11. Click **Save**

## Usage

Once configured, any email sent to `junk@n9a.us` will automatically:

1. Be received by Cloudflare Email Routing
2. Processed by your Email Worker
3. Converted to Markdown format
4. Posted to your Discord channel with all attachments

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

MIT
