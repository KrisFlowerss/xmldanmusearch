import { IncomingForm } from "formidable";
import fs from "fs";

// 全局变量保存最近解析的XML数据
let cachedXmlData = null;
let cachedDanmuItems = [];


export const config = {
  api: {
    bodyParser: false,
    responseLimit: "10mb",
  },
};

function formatTime(timeSec) {
  const hours = Math.floor(timeSec / 3600);
  const minutes = Math.floor((timeSec % 3600) / 60);
  const seconds = Math.floor(timeSec % 60);

  const pad = (n) => n.toString().padStart(2, "0");
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractAttribute(attributes, name) {
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${name}=(["'])([\\s\\S]*?)\\1`)
  );
  return match ? match[2] : "";
}

function parseDanmuItems(xmlText) {
  const items = [];
  const danmuRegex = /<d\b([^>]*)>([\s\S]*?)<\/d>/g;

  let match;
  while ((match = danmuRegex.exec(xmlText)) !== null) {
    const attributes = match[1] || "";
    const rawText = match[2] || "";
    const text = decodeXmlEntities(rawText).trim();
    const pValue = extractAttribute(attributes, "p");
    const timeSec = parseFloat((pValue || "").split(",")[0]);

    if (!text || Number.isNaN(timeSec)) {
      continue;
    }

    items.push({
      text,
      timeSec,
      pValue,
      user: decodeXmlEntities(extractAttribute(attributes, "user")),
      uid: extractAttribute(attributes, "uid"),
      timestamp: extractAttribute(attributes, "timestamp"),
    });
  }

  return items;
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { fields, files } = await new Promise((resolve, reject) => {
        const form = new IncomingForm();
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          resolve({ fields, files });
        });
      });

      const fileData = Array.isArray(files.xmlFile)
        ? files.xmlFile[0]
        : files.xmlFile;
      const filePath = fileData.filepath;

      // 保存 XML 文本和解析后的弹幕缓存，GET 可直接复用
      cachedXmlData = fs.readFileSync(filePath, "utf-8");
      cachedDanmuItems = parseDanmuItems(cachedXmlData);

      const keyword = fields.keyword;
      const keywordStr = typeof keyword === "string" ? keyword : String(keyword);
      const normalizedKeyword = keywordStr.trim().toLowerCase();

      const results = [];
      const matchingTimes = [];

      cachedDanmuItems.forEach((item) => {
        if (!item.text.toLowerCase().includes(normalizedKeyword)) {
          return;
        }

        matchingTimes.push(item.timeSec);
        results.push(`${formatTime(item.timeSec)} ${item.text}`);
      });

      const summaryGroups = [];
      matchingTimes.sort((a, b) => a - b);

      let i = 0;
      while (i <= matchingTimes.length - 3) {
        const groupStart = matchingTimes[i];
        let groupCount = 1;
        let groupEnd = groupStart;
        let j = i + 1;

        while (j < matchingTimes.length && matchingTimes[j] - groupEnd <= 15) {
          groupEnd = matchingTimes[j];
          groupCount++;
          j++;
        }

        if (groupCount >= 3) {
          summaryGroups.push({
            start: groupStart,
            end: groupEnd,
            count: groupCount,
            duration: groupEnd - groupStart,
          });
          i = j;
        } else {
          i++;
        }
      }

      summaryGroups.sort((a, b) => {
        if (b.count === a.count) {
          return a.duration - b.duration;
        }
        return b.count - a.count;
      });

      const summaries = summaryGroups.map((group) => ({
        startTime: formatTime(group.start),
        endTime: formatTime(group.end),
        duration: group.duration.toFixed(1),
        count: group.count,
        keyword: keywordStr,
      }));

      return res.status(200).json({
        summaries,
        results,
        stats: {
          totalMatches: results.length,
          density: cachedDanmuItems.length
            ? `${((results.length / cachedDanmuItems.length) * 100).toFixed(1)}%`
            : "0.0%",
        },
      });
    } catch (error) {
      console.error("Error processing file:", error);
      return res.status(500).json({
        error: "文件处理失败",
        details: error.message,
      });
    }
  } else if (req.method === "GET") {
    // 处理获取完整弹幕请求
    const { time } = req.query;
    const timeSec = parseFloat(time);

    if (!cachedXmlData || cachedDanmuItems.length === 0) {
      return res.status(400).json({ error: "请先上传XML文件并搜索" });
    }

    try {
      const danmuList = cachedDanmuItems
        .filter((item) => Math.abs(item.timeSec - timeSec) <= 15)
        .map((item) => ({
          time: formatTime(item.timeSec),
          text: item.text,
        }));

      return res.status(200).json({ danmuList });

    } catch (error) {
      return res.status(500).json({ error: "获取弹幕失败" });
    }

  } else {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
}
