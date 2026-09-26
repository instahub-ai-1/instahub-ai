Update my existing InstaHub AI project.

IMPORTANT:
- Do NOT redesign the website.
- Do NOT remove any existing functionality.
- Do NOT change the frontend.
- Do NOT change package.json unless absolutely necessary.
- Keep the existing Express server, CORS, routes, temporary file handling, media route, download-file route, and automatic cleanup.
- The project already has "youtube-dl-exec": "^3.1.15" installed.
- Use the bundled yt-dlp through youtube-dl-exec. Do NOT use execFile("yt-dlp", ...).

MAIN PROBLEM:
The server currently logs:

YT-DLP ERROR
MESSAGE:

but MESSAGE is blank, so the real yt-dlp error is hidden.

TASK:
Completely update server.js so that:
1. It imports:
   const youtubedl = require("youtube-dl-exec");

2. The /download route uses:
   await youtubedl(link, options, { timeout: 120000 })

3. Keep these yt-dlp options:
   - noPlaylist: true
   - noWarnings: true
   - format: "best[ext=mp4]/best"
   - output: outputFile
   - restrictFilenames: true
   - socketTimeout: 60
   - retries: 3
   - userAgent: Chrome/140 style browser user agent
   - referer: https://www.instagram.com/

4. Keep the existing:
   GET /
   GET /download
   GET /media/:id
   GET /download-file/:id

5. Keep temporary MP4 storage and 10-minute automatic cleanup.

6. Most importantly, create a detailed catch block that logs ALL available yt-dlp error information:

   console.log("=================================");
   console.log("YT-DLP ERROR");
   console.log("MESSAGE:", error.message);
   console.log("CODE:", error.code);
   console.log("STDERR:", error.stderr);
   console.log("STDOUT:", error.stdout);
   console.log("STACK:", error.stack);
   console.log(
     "FULL ERROR:",
     JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
   );
   console.log("=================================");

7. The JSON error response must return the actual available error:
   error.stderr || error.stdout || error.message || "Unknown yt-dlp error"

8. Keep server listening on:
   const PORT = process.env.PORT || 10000;
   app.listen(PORT, "0.0.0.0", ...)

9. At startup log:
   InstaHub AI running on port <PORT>
   REAL VIDEO DOWNLOADER ACTIVE
   BUNDLED YT-DLP ACTIVE

10. Do not add fake download success messages. Only return success when the MP4 file actually exists and has a size greater than 0.

Return the complete final server.js code only.