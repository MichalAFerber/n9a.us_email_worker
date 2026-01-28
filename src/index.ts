import PostalMime from 'postal-mime';

export interface Env {
  // JSON string mapping domains to Discord webhook URLs
  // Example: {"n9a.us":"https://discord.com/api/webhooks/...","ipcow.com":"https://discord.com/api/webhooks/..."}
  DOMAIN_WEBHOOKS: string;
  // Optional: fallback webhook if domain not found in mapping
  DEFAULT_WEBHOOK_URL?: string;
}

// Discord embed color (blue)
const EMBED_COLOR = 0x5865F2;

// Discord limits
const MAX_EMBED_DESCRIPTION = 4096;
const MAX_FIELD_VALUE = 1024;
const MAX_EMBED_TITLE = 256;
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB default Discord limit
const MAX_FILES_PER_MESSAGE = 10;

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
  image?: { url: string };
}

interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
  attachments?: { id: number; filename: string; description?: string }[];
}

interface ParsedAttachment {
  filename: string;
  mimeType: string;
  content: ArrayBuffer | Uint8Array;
  size: number;
  isImage: boolean;
  contentId?: string;
}

// Convert HTML to Discord-compatible Markdown without requiring DOM
function htmlToMarkdown(html: string): string {
  let text = html;
  
  // Remove scripts and styles
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Convert headers
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n');
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n');
  text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n\n');
  text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n\n');
  
  // Convert bold and italic
  text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  text = text.replace(/<(u)[^>]*>([\s\S]*?)<\/\1>/gi, '__$2__');
  text = text.replace(/<(s|strike|del)[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~');
  
  // Convert code
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```\n');
  
  // Convert links - extract href and text
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  
  // Convert lists
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '$1\n');
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '$1\n');
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '• $1\n');
  
  // Convert blockquotes
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, content) => {
    return content.split('\n').map((line: string) => '> ' + line).join('\n') + '\n';
  });
  
  // Convert line breaks and paragraphs
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<hr\s*\/?>/gi, '\n---\n');
  
  // Remove images (we handle them as attachments)
  text = text.replace(/<img[^>]*>/gi, '');
  
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&hellip;/gi, '…');
  text = text.replace(/&mdash;/gi, '—');
  text = text.replace(/&ndash;/gi, '–');
  text = text.replace(/&#(\d+);/gi, (match, dec) => String.fromCharCode(dec));
  
  // Clean up whitespace
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/^\s+|\s+$/g, '');
  
  return text.trim();
}

function getMarkdownContent(email: { text?: string; html?: string }): string {
  if (email.html) {
    try {
      const markdown = htmlToMarkdown(email.html);
      if (markdown) return markdown;
    } catch (e) {
      console.error('Error converting HTML to Markdown:', e);
    }
  }

  if (email.text) {
    return email.text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return '*(No content)*';
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

interface EmailData {
  from: string;
  fromName: string;
  to: string;
  cc?: string;
  replyTo?: string;
  subject: string;
  date: Date;
  text?: string;
  html?: string;
}

function generatePlainTextEmail(emailData: EmailData): string {
  const lines: string[] = [];
  
  // Header section
  lines.push('='.repeat(60));
  lines.push('EMAIL MESSAGE');
  lines.push('='.repeat(60));
  lines.push('');
  
  // Metadata
  lines.push(`From: ${emailData.fromName !== emailData.from ? `${emailData.fromName} <${emailData.from}>` : emailData.from}`);
  lines.push(`To: ${emailData.to}`);
  if (emailData.cc) {
    lines.push(`CC: ${emailData.cc}`);
  }
  if (emailData.replyTo && emailData.replyTo !== emailData.from) {
    lines.push(`Reply-To: ${emailData.replyTo}`);
  }
  lines.push(`Subject: ${emailData.subject}`);
  lines.push(`Date: ${emailData.date.toUTCString()}`);
  
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('BODY');
  lines.push('-'.repeat(60));
  lines.push('');
  
  // Body content - prefer plain text, fall back to converted HTML
  if (emailData.text) {
    lines.push(emailData.text.trim());
  } else if (emailData.html) {
    // Simple HTML to text conversion for the .txt file
    const textFromHtml = emailData.html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    lines.push(textFromHtml);
  } else {
    lines.push('(No content)');
  }
  
  lines.push('');
  lines.push('='.repeat(60));
  lines.push('END OF EMAIL');
  lines.push('='.repeat(60));
  
  return lines.join('\n');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFilename(filename: string): string {
  // Remove or replace characters that might cause issues
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100); // Limit filename length
}

async function sendToDiscordWithAttachments(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
  attachments: ParsedAttachment[]
): Promise<Response> {
  // If no attachments, send as JSON
  if (attachments.length === 0) {
    return fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  // Build multipart form data for attachments
  const formData = new FormData();

  // Add the JSON payload
  formData.append('payload_json', JSON.stringify(payload));

  // Add each attachment
  attachments.forEach((attachment, index) => {
    const blob = new Blob([attachment.content], { type: attachment.mimeType });
    formData.append(`files[${index}]`, blob, attachment.filename);
  });

  return fetch(webhookUrl, {
    method: 'POST',
    body: formData,
  });
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // Extract domain from the "to" address
    const toDomain = message.to.split('@')[1]?.toLowerCase()?.trim();
    
    console.log(`Processing email to: ${message.to}, extracted domain: ${toDomain}`);
    
    // Parse the domain-to-webhook mapping
    let webhookUrl: string | undefined;
    let domainWebhooks: Record<string, string> = {};
    try {
      domainWebhooks = JSON.parse(env.DOMAIN_WEBHOOKS || '{}');
      console.log(`Configured domains: ${Object.keys(domainWebhooks).join(', ')}`);
      webhookUrl = domainWebhooks[toDomain];
      console.log(`Webhook found for ${toDomain}: ${webhookUrl ? 'yes' : 'no'}`);
    } catch (e) {
      console.error('Failed to parse DOMAIN_WEBHOOKS:', e);
    }
    
    // Fall back to default webhook if domain not found
    if (!webhookUrl) {
      console.log(`Using default webhook for domain: ${toDomain}`);
      webhookUrl = env.DEFAULT_WEBHOOK_URL;
    }
    
    // If still no webhook, log and reject
    if (!webhookUrl) {
      console.error(`No webhook configured for domain: ${toDomain}`);
      message.setReject(`No webhook configured for ${toDomain}`);
      return;
    }

    try {
      // Parse the email using postal-mime
      const email = await PostalMime.parse(message.raw);

      // Extract email details
      const from = email.from?.address || message.from || 'Unknown Sender';
      const fromName = email.from?.name || from;
      const to = email.to?.map((t) => t.address).join(', ') || message.to || 'Unknown';
      const subject = email.subject || '(No Subject)';
      const date = email.date ? new Date(email.date) : new Date();
      const cc = email.cc && email.cc.length > 0 ? email.cc.map((c) => c.address).join(', ') : undefined;
      const replyTo = email.replyTo && email.replyTo.length > 0 ? email.replyTo[0].address : undefined;

      // Convert HTML to Markdown (or use plain text) for Discord embed
      const body = getMarkdownContent(email);

      // Generate plain text email.txt
      const emailTxtContent = generatePlainTextEmail({
        from,
        fromName,
        to,
        cc,
        replyTo,
        subject,
        date,
        text: email.text,
        html: email.html,
      });
      const emailTxtBytes = new TextEncoder().encode(emailTxtContent);

      // Process attachments - start with email.txt
      const parsedAttachments: ParsedAttachment[] = [];
      const skippedAttachments: string[] = [];
      let firstImageFilename: string | null = null;

      // Add email.txt as the first attachment
      parsedAttachments.push({
        filename: 'email.txt',
        mimeType: 'text/plain',
        content: emailTxtBytes,
        size: emailTxtBytes.length,
        isImage: false,
      });

      // Process email attachments
      if (email.attachments && email.attachments.length > 0) {
        for (const att of email.attachments) {
          const filename = sanitizeFilename(att.filename || `attachment_${parsedAttachments.length}`);
          const mimeType = att.mimeType || 'application/octet-stream';
          
          // Convert content to Uint8Array if it's a string
          let content: ArrayBuffer | Uint8Array;
          if (typeof att.content === 'string') {
            content = new TextEncoder().encode(att.content);
          } else {
            content = att.content;
          }
          
          const size = content instanceof ArrayBuffer ? content.byteLength : content.length;
          const isImage = isImageMimeType(mimeType);

          // Check file size limit
          if (size > MAX_FILE_SIZE) {
            skippedAttachments.push(`${filename} (${formatFileSize(size)} - too large)`);
            continue;
          }

          // Check max files limit (reserve 1 slot for email.txt)
          if (parsedAttachments.length >= MAX_FILES_PER_MESSAGE) {
            skippedAttachments.push(`${filename} (max files reached)`);
            continue;
          }

          // Track first image for embed
          if (isImage && !firstImageFilename) {
            firstImageFilename = filename;
          }

          parsedAttachments.push({
            filename,
            mimeType,
            content,
            size,
            isImage,
            contentId: att.contentId,
          });
        }
      }

      // Build Discord embed
      const embed: DiscordEmbed = {
        title: truncate(`📧 ${subject}`, MAX_EMBED_TITLE),
        color: EMBED_COLOR,
        fields: [
          {
            name: '👤 From',
            value: truncate(fromName !== from ? `${fromName} <${from}>` : from, MAX_FIELD_VALUE),
            inline: true,
          },
          {
            name: '📬 To',
            value: truncate(to, MAX_FIELD_VALUE),
            inline: true,
          },
        ],
        footer: {
          text: 'Email received via Cloudflare Email Worker',
        },
        timestamp: date.toISOString(),
      };

      // Add CC if present
      if (cc) {
        embed.fields!.push({
          name: '📋 CC',
          value: truncate(cc, MAX_FIELD_VALUE),
          inline: true,
        });
      }

      // Add Reply-To if different from From
      if (replyTo && replyTo !== from) {
        embed.fields!.push({
          name: '↩️ Reply-To',
          value: truncate(replyTo, MAX_FIELD_VALUE),
          inline: true,
        });
      }

      // Add body content (Markdown formatted)
      if (body) {
        embed.description = truncate(body, MAX_EMBED_DESCRIPTION);
      }

      // If there's an image attachment, embed the first one in the embed
      if (firstImageFilename) {
        embed.image = { url: `attachment://${firstImageFilename}` };
      }

      // Add info about attachments (excluding email.txt from the count shown to user)
      const userAttachments = parsedAttachments.filter(a => a.filename !== 'email.txt');
      if (userAttachments.length > 0 || skippedAttachments.length > 0) {
        const attachmentLines: string[] = [];

        // List included attachments (not email.txt)
        for (const att of userAttachments) {
          const icon = att.isImage ? '🖼️' : '📎';
          attachmentLines.push(`${icon} ${att.filename} (${formatFileSize(att.size)})`);
        }

        // List skipped attachments
        for (const skipped of skippedAttachments) {
          attachmentLines.push(`⚠️ ${skipped}`);
        }

        embed.fields!.push({
          name: `📁 Attachments (${userAttachments.length}${skippedAttachments.length > 0 ? ` + ${skippedAttachments.length} skipped` : ''})`,
          value: truncate(attachmentLines.join('\n'), MAX_FIELD_VALUE),
          inline: false,
        });
      }

      // Create webhook payload with attachment references
      const payload: DiscordWebhookPayload = {
        username: 'Email Bot',
        embeds: [embed],
      };

      // Add attachment metadata to payload
      if (parsedAttachments.length > 0) {
        payload.attachments = parsedAttachments.map((att, index) => ({
          id: index,
          filename: att.filename,
          description: att.filename === 'email.txt' ? 'Full email as plain text' : (att.isImage ? 'Email image' : 'Email attachment'),
        }));
      }

      // Send to Discord with attachments
      const response = await sendToDiscordWithAttachments(webhookUrl, payload, parsedAttachments);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Discord webhook failed: ${response.status} - ${errorText}`);

        // If the request failed, try sending without attachments
        if (response.status === 400 || response.status === 413) {
          console.log('Retrying without attachments...');

          // Remove image embed reference
          delete embed.image;

          // Update attachments field to note they couldn't be sent
          const attachmentField = embed.fields?.find((f) => f.name.startsWith('📁'));
          if (attachmentField) {
            attachmentField.value = '⚠️ Attachments could not be uploaded (size limit)';
          }

          const simplePayload: DiscordWebhookPayload = {
            username: 'Email Bot',
            embeds: [embed],
          };

          const retryResponse = await sendToDiscordWithAttachments(webhookUrl, simplePayload, []);
          if (!retryResponse.ok) {
            console.error(`Discord webhook retry failed: ${retryResponse.status}`);
          }
        }
      }

      console.log(
        `Successfully processed email from ${from} with subject: ${subject}, attachments: ${parsedAttachments.length}`
      );
    } catch (error) {
      console.error('Error processing email:', error);

      // Try to send error notification to Discord
      try {
        const errorPayload: DiscordWebhookPayload = {
          username: 'Email Bot',
          content: `⚠️ **Error processing email**\nFrom: ${message.from}\nTo: ${message.to}\nError: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        await sendToDiscordWithAttachments(webhookUrl, errorPayload, []);
      } catch (notifyError) {
        console.error('Failed to send error notification:', notifyError);
      }
    }
  },
};
