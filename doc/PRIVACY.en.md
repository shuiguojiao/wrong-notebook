# Privacy policy

[简体中文](PRIVACY.md) · Updated: 2026-11-10

## Scope and storage

wrong-notebook is self-hostable study software. Desktop editions run the server locally. The operator of each Docker, npm, fnOS or source deployment manages that instance's data. Android clients connect to the instance chosen by the user. Who can access data depends on the deployment and its operator.

An instance stores account information, password hashes, question text and images, answers, practice and exam records, and preferences needed for its features. Databases, uploaded files, server logs and configuration are stored in that instance's data or configuration directories; see the [installer guide](INSTALL_PACKAGES.md) for platform paths. Browser diagnostic logs may include page URLs, browser identifiers, errors and operation context and are sent to the same instance's server. They are not automatically sent to the project maintainer's servers.

Text and direct-entry drafts are stored per account and notebook in the current browser tab’s session storage and survive refresh. Clearing a draft, signing out or deleting the account clears the corresponding content. Drafts are not included in personal backups or automatically sent to AI. If session storage is unavailable, they only remain in the current page. Selected files and parsing summaries only remain in the current page; refresh requires selecting the file again.

AI API keys and endpoints, and credentials for a MiniMax Code account that the user chooses to connect, are stored in the instance configuration. MiniMax Code access and refresh tokens, account details and check-in results are stored in `minimax-code.json` in the configuration directory. Protect access to your instance, configuration and backups.

Handwriting vector drafts stay in memory on the current page. The browser additionally remembers only whether pen input has been detected, to enable palm rejection by default. Confirming a practice result stores the handwritten answer image and AI transcription on the instance and includes them in full personal backups.

Photo answers stay in memory for the current answer and are cleared on a question change or refresh. After self-assessment confirmation, cropped and compressed photos and handwriting are vertically composed into a display image stored on the instance and included in full personal backups. The system opens the camera only when the user selects Take a photo. The app does not request persistent camera access.

## Third-party services

- Enabling review reminders sends due question counts and subjects to your selected third-party push service, with a review-page link when the site URL is configured. Question text, images and answers are not sent. Push credentials are stored in the instance database and included in your plaintext export backups; protect them. Disabling reminders stops future automatic sends but does not remove data already received by third parties.
- AI recognition, explanations, exercises and animations send the question content, images, answers or prompts needed for the task to the AI provider and endpoint configured by the administrator. Before first use, each account sees an "AI data sharing" notice listing the data sent and the current provider, and **nothing is sent until the user agrees**. If the user declines, AI features are unavailable (mastery is estimated by rules instead) and everything else keeps working. Consent can be withdrawn any time under Settings → Account; withdrawing does not affect data already sent to the provider.
- Automatic image-text integrity checks are enabled by default. After account AI data consent, question images imported through the web or agents, source-page thumbnails (highlighting question regions), question text, reference answers and recorded student answers are sent to the server-configured AI service to compare the image with saved text. Changes to relevant content trigger another check; text-only questions are skipped. Administrators can stop future automatic checks by turning off “Automatically check imported questions against original images” under Settings → AI Settings. Turning it off does not affect data already received by the provider.
- Photo answers are cropped and compressed on the device, then sent to the configured AI provider in the same way as handwriting images. Original photos are neither uploaded nor saved.
- Submitting handwriting for original-review or similar-question grading sends the cropped, compressed image together with the question, reference answer and optional typed answer to the configured AI provider and endpoint for recognition and grading, under the same AI data consent. Withdrawing consent or deleting local records does not affect data already received by the provider.
- Cloud speech sends narration text to the configured speech provider. Browser speech uses browser-provided capabilities; processing depends on the browser and selected voice.
- After the user signs in to MiniMax Code, login, token refresh and AI requests connect to MiniMax. Automatic check-in also periodically sends authenticated check-in requests. Connecting an account is optional, and the user can sign out in Settings.
- Opening documentation or project links visits third-party websites such as GitHub, which process access requests under their own policies.

Request retention and processing are governed by the selected service's terms. Common policies include [Google](https://policies.google.com/privacy), [OpenAI](https://openai.com/policies/privacy-policy/), [Anthropic](https://www.anthropic.com/legal/privacy), [Microsoft](https://privacy.microsoft.com/privacystatement), and [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Consult the relevant provider for other AI channels and custom endpoints.

## Data management and contact

Users can delete questions and study records and export their personal data. Regular users can also delete their account under Settings → Danger Zone by entering their password, which permanently deletes the account and all of its data (administrator accounts cannot delete themselves). Instance administrators manage accounts, databases, uploads, logs and backups. Uninstalling a desktop app does not automatically delete its data directory; uninstalling standalone Android deletes its private data. Deleting instance data does not delete exported backups or requests already received by third parties; manage those separately with their respective operators.

Contact your instance administrator for privacy requests about a self-hosted deployment. Contact the software maintainer through project [Issues](https://github.com/shuiguojiao/wrong-notebook/issues); use the [security reporting channel](../SECURITY.md) for sensitive account, credential or vulnerability information instead of posting it publicly.


## Voluntary problem reports

Your voluntarily submitted problem reports and question snapshots are visible to administrators. Snapshots include question text, answers, explanations, knowledge tags, subject, grade, entry method and source, plus the AI provider/model at entry where reliably linked. They exclude original image content and image addresses, recording only whether an original image exists. The submission dialog explains this scope; avoid sensitive information in descriptions. Admins can set a status and a note visible to the submitter; the report list has no links into complete user notebooks. Reports and snapshots survive deletion of the original question and are deleted with the account. Reports and admin responses are included in personal backups; protect those files. Responses restored from backups are restored records, not a new administrator review on the current instance.
