import { IncomingForm } from "formidable";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";
import path from "path";

// 全局变量保存最近解析的XML数据
let cachedXmlData = null;


export const config = {
  api: {
    bodyParser: false,
    responseLimit: '10mb'  // 增加响应大小限制
  },
};

function formatTime(timeSec) {
  const hours = Math.floor(timeSec / 3600);
  const minutes = Math.floor((timeSec % 3600) / 60);
  const seconds = Math.floor(timeSec % 60);

  const pad = (n) => n.toString().padStart(2, '0');
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
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
        
        // 保存XML数据到缓存
        cachedXmlData = fs.readFileSync(filePath, "utf-8");
        
        const keyword = fields.keyword;
        const keywordStr = typeof keyword === "string" ? keyword : String(keyword);

        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@_",
        });
        const jsonObj = parser.parse(cachedXmlData);

        const results = [];
        const matchingTimes = [];
        const danmus = jsonObj.i?.d || [];
        const dItems = Array.isArray(danmus) ? danmus : [danmus];

        dItems.forEach((d) => {
          let textContent = d["#text"] || "";
          if (typeof textContent !== "string") {
            textContent = String(textContent);
          }
          if (textContent.toLowerCase().includes(keywordStr.toLowerCase())) {
            const pValue = d["@_p"] || "";
            const time = pValue.split(",")[0];
            const timeSec = parseFloat(time);
            matchingTimes.push(timeSec);

            results.push(`${formatTime(timeSec)} ${textContent}`);
          }
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
            density: (results.length / dItems.length * 100).toFixed(1) + '%',
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

      if (!cachedXmlData) {
        return res.status(400).json({ error: "请先上传XML文件并搜索" });
      }

      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@_",
        });
        const jsonObj = parser.parse(cachedXmlData);
        const danmus = jsonObj.i?.d || [];
        const dItems = Array.isArray(danmus) ? danmus : [danmus];

        const danmuList = [];
        dItems.forEach((d) => {
          const pValue = d["@_p"] || "";
          const time = pValue.split(",")[0];
          const timeSecItem = parseFloat(time);
          if (!isNaN(timeSecItem) && Math.abs(timeSecItem - timeSec) <= 15) {
            const textContent = d["#text"] || String(d);
            danmuList.push({
              time: formatTime(timeSecItem),
              text: textContent,
            });
          }
        });

        return res.status(200).json({ danmuList });

    } catch (error) {
      return res.status(500).json({ error: "获取弹幕失败" });
    }
    
  } else {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
};

