import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const API_BASE_URL = "https://api.fabdl.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";

const HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://spodownloader.com",
  Referer: "https://spodownloader.com/",
  "User-Agent": USER_AGENT,
};

// ⏱ تبدیل زمان از میلی‌ثانیه به دقیقه:ثانیه
function formatDuration(ms) {
  if (!ms || ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// 📡 تابع درخواست با axios
async function request(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 60000 });
    return data;
  } catch (err) {
    throw new Error(
      `Request failed: ${err.response?.status || ""} ${err.message}`
    );
  }
}

// ⚡️ Route اصلی
app.get("/", async (req, res) => {
  const spotifyUrl = req.query.url?.trim();
  if (
    !spotifyUrl ||
    !/^https?:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/.test(spotifyUrl)
  ) {
    return res.status(400).json({
      success: false,
      message: "آدرس URL اسپاتیفای نامعتبر است.",
    });
  }

  const trackIdMatch = spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
  const trackId = trackIdMatch ? trackIdMatch[1] : null;
  if (!trackId)
    return res.status(400).json({ success: false, message: "شناسه آهنگ پیدا نشد." });

  try {
    // 🔹 مرحله ۱: اطلاعات آهنگ
    const step1 = await request(`${API_BASE_URL}/spotify/get?url=${encodeURIComponent(spotifyUrl)}`);
    if (!step1?.result?.gid)
      return res.status(502).json({ success: false, message: "دریافت اطلاعات اولیه ناموفق بود.", data: step1 });

    const gid = step1.result.gid;
    const trackInfo = step1.result;

    // 🔹 مرحله ۲: ایجاد تسک تبدیل
    const step2 = await request(`${API_BASE_URL}/spotify/mp3-convert-task/${gid}/${trackId}`);
    if (!step2?.result?.tid)
      return res.status(502).json({ success: false, message: "ایجاد تسک تبدیل ناموفق بود.", data: step2 });

    const taskId = step2.result.tid;

    // 🔹 مرحله ۳: بررسی وضعیت تا آماده شدن لینک
    let attempts = 0;
    const maxAttempts = 15;
    let downloadUrl = null;

    while (attempts < maxAttempts) {
      const progress = await request(`${API_BASE_URL}/spotify/mp3-convert-progress/${taskId}`);
      const status = progress?.result?.status;

      if (status === 3 && progress.result.download_url) {
        downloadUrl = API_BASE_URL + progress.result.download_url;
        break;
      } else if (status === 4) {
        return res.status(502).json({
          success: false,
          message: "فرآیند تبدیل شکست خورد.",
          data: progress,
        });
      }

      attempts++;
      await new Promise((r) => setTimeout(r, 5000)); // صبر ۵ ثانیه‌ای
    }

    // 🔹 نهایی
    if (downloadUrl) {
      return res.json({
        success: true,
        message: "موفق",
        data: {
          title: trackInfo.name || "نامشخص",
          artist: trackInfo.artists || "نامشخص",
          duration: formatDuration(trackInfo.duration_ms),
          thumbnail: trackInfo.image || null,
          download_url: downloadUrl,
        },
      });
    } else {
      return res
        .status(408)
        .json({ success: false, message: "فرآیند تبدیل بیش از حد طول کشید (تایم‌اوت)." });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// ✨ هندل مسیر پیش‌فرض
app.get("/", (req, res) => {
  res.json({
    success: false,
    message: "پارامتر url تنظیم نشده است.",
    example: "/?url=https://open.spotify.com/track/XXXXXXXXX"
  });
});

// 🚀 راه‌اندازی سرور
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
