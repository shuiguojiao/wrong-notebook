# AI Agent Integration

Create a personal access token under **Settings → Account → AI Agent Integration**. Enter a name and optional expiration. Copy the plaintext immediately: it is shown only once. Each account can have up to 20 unrevoked tokens. The list shows prefixes and last usage; revoke a token at any time.

Tokens use the `wnb_` prefix plus random data. Only SHA-256 hashes are stored. Credentials are excluded from personal and full backups; create new tokens after restoring elsewhere. Grant tokens only to trusted agents, treat them as account writing credentials, and use HTTPS. Never expose them in logs, screenshots or Git.

The settings panel provides a reserved MCP address and client examples. Structured import APIs and MCP tools will be connected in subsequent commits.
