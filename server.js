const express = require("express");
const cors = require("cors");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DOWNLOAD_DIR = path.join(os.tmpdir(), "instahub-ai");
const YTDLP = "/usr/local/bin/yt-dlp";

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

const files = new Map();

/* =========================================
   HOME
========================================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================================
   HELPERS
========================================= */

function cleanUrl(url) {
  if (!url) return null;

  return url
    .replace(/\\u0026/g, "&")
    .replace(/\\u003D/g, "=")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\\u0022/g, '"');
}

function findImageUrl(html) {

  if (!html) return null;

  let match;

  /* ---------------------------------------
     1. og:image
  --------------------------------------- */

  match = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  );

  if (match && match[1]) {
    return cleanUrl(match[1]);
  }

  /* Reverse attribute order */

  match = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  );

  if (match && match[1]) {
    return cleanUrl(match[1]);
  }

  /* ---------------------------------------
     2. og:image:secure_url
  --------------------------------------- */

  match = html.match(
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i
  );

  if (match && match[1]) {
    return cleanUrl(match[1]);
  }

  /* ---------------------------------------
     3. twitter:image
  --------------------------------------- */

  match = html.match(
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
  );

  if (match && match[1]) {
    return cleanUrl(match[1]);
  }

  match = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
  );

  if (match && match[1]) {
    return cleanUrl(match[1]);
  }

  /* ---------------------------------------
     4. display_url
  --------------------------------------- */

  match = html.match(
    /"display_url"\s*:\s*"([^"]+)"/i
  );

  if (match && match[1]) {
    return cleanUrl(match[1]);
  }

  /* ---------------------------------------
     5. image_versions2 candidates
  --------------------------------------- */

  match = html.match(
    /"url"\s*:\s*"(https?:\\?\/\\?\/[^"]+?(?:jpg|jpeg|webp)[^"]*)"/i
  );

  if (match && match[1]) {
    return cleanUrl(match[1]);
  }

  /* ---------------------------------------
     6. CDN Instagram image URL
  --------------------------------------- */

  const cdnMatches = html.match(
    /https?:\\?\/\\?\/[^"'\\\s]+(?:cdninstagram|fbcdn)[^"'\\\s]+\.(?:jpg|jpeg|webp)[^"'\\\s]*/gi
  );

  if (cdnMatches && cdnMatches.length) {
    return cleanUrl(cdnMatches[0]);
  }

  return null;
}

/* =========================================
   FETCH INSTAGRAM PAGE
========================================= */

async function fetchInstagramPage(url) {

  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",

      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

      "Accept-Language":
        "en-US,en;q=0.9",

      "Cache-Control":
        "no-cache",

      "Referer":
        "https://www.instagram.com/"
    }
  });

  const html = await response.text();

  console.log(
    "PAGE STATUS:",
    response.status,
    "HTML:",
    html.length
  );

  return {
    ok: response.ok,
    status: response.status,
    html
  };
}

/* =========================================
   PHOTO DOWNLOADER
========================================= */

async function downloadInstagramPhoto(link, res, id) {

  const imageFile = path.join(
    DOWNLOAD_DIR,
    `${id}.jpg`
  );

  try {

    console.log("=================================");
    console.log("PHOTO FALLBACK START");
    console.log("LINK:", link);
    console.log("=================================");

    let imageUrl = null;

    /* ---------------------------------------
       METHOD 1
       NORMAL INSTAGRAM PAGE
    --------------------------------------- */

    console.log(
      "PHOTO METHOD 1: NORMAL PAGE"
    );

    try {

      const page =
        await fetchInstagramPage(link);

      imageUrl =
        findImageUrl(page.html);

      if (imageUrl) {
        console.log(
          "PHOTO FOUND FROM NORMAL PAGE"
        );
      }

    } catch (error) {

      console.log(
        "NORMAL PAGE ERROR:",
        error.message
      );
    }

    /* ---------------------------------------
       METHOD 2
       INSTAGRAM EMBED
    --------------------------------------- */

    if (!imageUrl) {

      console.log(
        "PHOTO METHOD 2: INSTAGRAM EMBED"
      );

      try {

        const embedUrl =
          link.replace(
            /\/?$/,
            "/embed/captioned/"
          );

        console.log(
          "EMBED URL:",
          embedUrl
        );

        const embed =
          await fetchInstagramPage(
            embedUrl
          );

        imageUrl =
          findImageUrl(embed.html);

        if (imageUrl) {

          console.log(
            "PHOTO FOUND FROM EMBED"
          );

        }

      } catch (error) {

        console.log(
          "EMBED ERROR:",
          error.message
        );
      }
    }

    /* ---------------------------------------
       METHOD 3
       STANDARD EMBED
    --------------------------------------- */

    if (!imageUrl) {

      console.log(
        "PHOTO METHOD 3: STANDARD EMBED"
      );

      try {

        const embedUrl =
          link.replace(
            /\/?$/,
            "/embed/"
          );

        const embed =
          await fetchInstagramPage(
            embedUrl
          );

        imageUrl =
          findImageUrl(embed.html);

        if (imageUrl) {

          console.log(
            "PHOTO FOUND FROM STANDARD EMBED"
          );

        }

      } catch (error) {

        console.log(
          "STANDARD EMBED ERROR:",
          error.message
        );
      }
    }

    /* ---------------------------------------
       NOTHING FOUND
    --------------------------------------- */

    if (!imageUrl) {

      console.log(
        "================================="
      );

      console.log(
        "PHOTO URL NOT FOUND"
      );

      console.log(
        "================================="
      );

      return res.status(500).json({
        success: false,
        message:
          "Instagram photo could not be found. The post may be private, login-protected, or unavailable."
      });
    }

    console.log(
      "PHOTO URL FOUND:"
    );

    console.log(
      imageUrl.substring(0, 200)
    );

    /* ---------------------------------------
       DOWNLOAD IMAGE
    --------------------------------------- */

    const imageResponse =
      await fetch(
        imageUrl,
        {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",

            "Accept":
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",

            "Referer":
              "https://www.instagram.com/"
          }
        }
      );

    console.log(
      "IMAGE DOWNLOAD STATUS:",
      imageResponse.status
    );

    if (!imageResponse.ok) {

      throw new Error(
        "Instagram image server returned HTTP " +
        imageResponse.status
      );
    }

    const contentType =
      imageResponse.headers.get(
        "content-type"
      ) || "";

    console.log(
      "IMAGE CONTENT TYPE:",
      contentType
    );

    const buffer =
      Buffer.from(
        await imageResponse.arrayBuffer()
      );

    if (!buffer.length) {

      throw new Error(
        "Image response was empty"
      );
    }

    fs.writeFileSync(
      imageFile,
      buffer
    );

    const size =
      fs.statSync(
        imageFile
      ).size;

    console.log(
      "IMAGE FILE SIZE:",
      size
    );

    if (size <= 0) {

      throw new Error(
        "Image file is empty"
      );
    }

    files.set(id, {
      path: imageFile,
      type: "image",
      created: Date.now()
    });

    cleanupFile(id);

    console.log(
      "================================="
    );

    console.log(
      "IMAGE READY:",
      id
    );

    console.log(
      "================================="
    );

    return res.json({
      success: true,
      type: "image",
      title: "Instagram Photo",
      mediaUrl:
        `/media/${id}`,
      downloadUrl:
        `/download-file/${id}`
    });

  } catch (error) {

    console.log(
      "PHOTO FALLBACK FINAL ERROR:",
      error.message
    );

    try {

      if (
        fs.existsSync(
          imageFile
        )
      ) {
        fs.unlinkSync(
          imageFile
        );
      }

    } catch {}

    return res.status(500).json({
      success: false,
      message:
        "This Instagram photo could not be downloaded.",
      error:
        error.message
    });
  }
}

/* =========================================
   VIDEO DOWNLOADER
========================================= */

function downloadWithYtdlp(
  link,
  outputFile,
  res,
  id
) {

  const args = [
    link,

    "--no-playlist",

    "--no-warnings",

    "--format",
    "best[ext=mp4]/best",

    "--output",
    outputFile,

    "--restrict-filenames",

    "--socket-timeout",
    "60",

    "--retries",
    "3",

    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",

    "--referer",
    "https://www.instagram.com/"
  ];

  console.log(
    "================================="
  );

  console.log(
    "STARTING YT-DLP"
  );

  console.log(
    "YT-DLP PATH:",
    YTDLP
  );

  console.log(
    "LINK:",
    link
  );

  console.log(
    "================================="
  );

  execFile(
    YTDLP,
    args,
    {
      timeout: 120000
    },

    (error, stdout, stderr) => {

      console.log(
        "YT-DLP STDOUT:"
      );

      console.log(
        stdout
      );

      console.log(
        "YT-DLP STDERR:"
      );

      console.log(
        stderr
      );

      /* ---------------------------------
         VIDEO SUCCESS
      --------------------------------- */

      if (
        !error &&
        fs.existsSync(outputFile)
      ) {

        const size =
          fs.statSync(
            outputFile
          ).size;

        if (size > 0) {

          files.set(id, {
            path: outputFile,
            type: "video",
            created: Date.now()
          });

          cleanupFile(id);

          console.log(
            "VIDEO READY:",
            id
          );

          return res.json({
            success: true,
            type: "video",
            title:
              "Instagram Post",
            mediaUrl:
              `/media/${id}`,
            downloadUrl:
              `/download-file/${id}`
          });
        }
      }

      /* ---------------------------------
         VIDEO FAILED
         TRY PHOTO
      --------------------------------- */

      console.log(
        "YT-DLP VIDEO FAILED."
      );

      console.log(
        "TRYING PHOTO FALLBACK..."
      );

      downloadInstagramPhoto(
        link,
        res,
        id
      );
    }
  );
}

/* =========================================
   DOWNLOAD API
========================================= */

app.get(
  "/download",
  (req, res) => {

    const link =
      req.query.link;

    console.log(
      "================================="
    );

    console.log(
      "REQUEST RECEIVED:"
    );

    console.log(
      link
    );

    console.log(
      "================================="
    );

    if (
      !link ||
      !link.includes(
        "instagram.com"
      )
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Valid Instagram URL required"
      });
    }

    const id =
      crypto.randomUUID();

    const outputFile =
      path.join(
        DOWNLOAD_DIR,
        `${id}.mp4`
      );

    downloadWithYtdlp(
      link,
      outputFile,
      res,
      id
    );
  }
);

/* =========================================
   MEDIA PREVIEW
========================================= */

app.get(
  "/media/:id",
  (req, res) => {

    const file =
      files.get(
        req.params.id
      );

    if (
      !file ||
      !fs.existsSync(
        file.path
      )
    ) {

      return res
        .status(404)
        .send(
          "Media not found or expired."
        );
    }

    if (
      file.type === "image"
    ) {

      res.type("jpg");

    } else {

      res.type("mp4");

    }

    res.sendFile(
      file.path
    );
  }
);

/* =========================================
   DOWNLOAD FILE
========================================= */

app.get(
  "/download-file/:id",
  (req, res) => {

    const file =
      files.get(
        req.params.id
      );

    if (
      !file ||
      !fs.existsSync(
        file.path
      )
    ) {

      return res
        .status(404)
        .send(
          "Media not found or expired."
        );
    }

    if (
      file.type === "image"
    ) {

      return res.download(
        file.path,
        "instahub-ai-post.jpg"
      );
    }

    return res.download(
      file.path,
      "instahub-ai-post.mp4"
    );
  }
);

/* =========================================
   CLEANUP
========================================= */

function cleanupFile(id) {

  setTimeout(
    () => {

      const file =
        files.get(id);

      if (!file) {
        return;
      }

      try {

        if (
          fs.existsSync(
            file.path
          )
        ) {

          fs.unlinkSync(
            file.path
          );
        }

      } catch (error) {

        console.log(
          "Cleanup error:",
          error.message
        );
      }

      files.delete(id);

      console.log(
        "FILE CLEANED:",
        id
      );

    },
    10 * 60 * 1000
  );
}

/* =========================================
   SERVER
========================================= */

const PORT =
  process.env.PORT || 10000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================="
    );

    console.log(
      "InstaHub AI running on port " +
      PORT
    );

    console.log(
      "YT-DLP PATH:",
      YTDLP
    );

    console.log(
      "PHOTO FALLBACK: ACTIVE"
    );

    console.log(
      "================================="
    );
  }
);