import { useState, useRef, useEffect, useMemo } from "react";

// 时间转换函数
const timeToSeconds = (timeStr) => {
  try {
    const cleanTime = timeStr.replace(/[^0-9.:]/g, "");
    const [mainPart, msPart] = cleanTime.split(".");
    const parts = mainPart.split(":").map(Number);

    let seconds = 0;
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
      seconds = parts[0];
    }

    if (msPart) {
      seconds += parseFloat(`0.${msPart}`);
    }

    return seconds;
  } catch (e) {
    console.error("时间格式转换错误:", timeStr);
    return 0;
  }
};

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState([]);
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [summaries, setSummaries] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processedResults, setProcessedResults] = useState([]);
  const [generatedCommand, setGeneratedCommand] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [sortBy, setSortBy] = useState('count');
  const resultsListRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(null);
  const [fullDanmuList, setFullDanmuList] = useState([]);

  // 预处理结果数据
  useEffect(() => {
    if (results.length > 0) {
      const sorted = results
        .map((r) => {
          const [time, ...textParts] = r.split(" ");
          return {
            raw: r,
            time,
            text: textParts.join(" "),
            seconds: timeToSeconds(time),
          };
        })
        .sort((a, b) => a.seconds - b.seconds);
      setProcessedResults(sorted);
    }
  }, [results]);

  // 优化后的滚动逻辑
  const scrollToTime = (targetSeconds) => {
    if (!resultsListRef.current || processedResults.length === 0) return;

    let targetIndex = processedResults.findIndex((r) => r.seconds >= targetSeconds);
    if (targetIndex === -1) targetIndex = processedResults.length - 1;
    const container = resultsListRef.current;
    const item = container.children[targetIndex];
    if (item) {
      item.scrollIntoView({ behavior: "smooth", block: "center" });
      Array.from(container.children).forEach((el) => el.classList.remove("highlight"));
      item.classList.add("highlight-item");
    }
  };

  // 生成 FFmpeg 命令
  const generateFFmpegCommand = (startTime, endTime) => {
    if (!file) return;

    const formatTime = (timeStr) => {
      const parts = timeStr.split(":");
      if (parts.length === 2) {
        return `00:${timeStr}`;
      }
      return timeStr;
    };

    const formattedStartTime = formatTime(startTime);
    const formattedEndTime = formatTime(endTime);
    const fileName = file.name.replace(".xml", ".mp4");
    const currentDate = new Date().toISOString().replace(/[:.]/g, "-");
    const command = `ffmpeg -i ${fileName} -ss ${formattedStartTime} -to ${formattedEndTime} -c copy output${currentDate}.mp4`;
    setGeneratedCommand(command);
    setIsCopied(false);
  };

  // 复制命令到剪贴板
  const handleCopyCommand = () => {
    navigator.clipboard.writeText(generatedCommand).then(() => {
      setIsCopied(true);
    });
  };

  // 搜索逻辑
  const handleSearch = async () => {
    if (!file) {
      alert("请上传 XML 文件！");
      return;
    }
    if (!keyword.trim()) {
      alert("请输入有效关键词！");
      return;
    }

    const formData = new FormData();
    formData.append("xmlFile", file);
    formData.append("keyword", keyword);

    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setSummaries(data.summaries || []);
      setResults(data.results || []);
      setSubmittedKeyword(keyword);
    } catch (error) {
      console.error("搜索失败：", error);
      alert("搜索失败，请检查服务是否正常！");
    } finally {
      setLoading(false);
    }
  };

  // 按钮点击事件
  const handleTimeRangeClick = (startTime, endTime) => {
    const startSec = timeToSeconds(startTime);
    scrollToTime(startSec);
    generateFFmpegCommand(startTime, endTime);
  };

  // 文件上传
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  // 根据排序方式排序 summaries
  const sortedSummaries = useMemo(() => {
    if (!summaries.length) return [];
    if (sortBy === 'count') {
      return [...summaries].sort((a, b) => b.count - a.count);
    } else {
      return [...summaries]
        .filter(s => s.count > 15)
        .sort((a, b) => {
          const aStart = timeToSeconds(a.startTime);
          const bStart = timeToSeconds(b.startTime);
          return aStart - bStart;
        });
    }
  }, [summaries, sortBy]);

  // （保持原有代码不变，只修改 handleJumpToTime 函数）

// 点击时间节点跳转
const handleJumpToTime = async (targetSeconds) => {
  setCurrentTime(targetSeconds);
  try {
    const res = await fetch(`/api/search?time=${targetSeconds}`, {  // 注意这里改为调用/search接口
      method: "GET",
    });
    if (!res.ok) {
      throw new Error(`HTTP错误! 状态码: ${res.status}`);
    }
    const data = await res.json();
    setFullDanmuList(data.danmuList);
  } catch (error) {
    console.error("获取完整弹幕失败：", error);
    alert("获取完整弹幕失败，请确保已上传XML文件并执行搜索！");
  }
};

// 其他部分保持不变...


  // 返回按钮
  const handleReturn = () => {
    setCurrentTime(null);
    setFullDanmuList([]);
  };

  return (
    <div className="container">
      <h1>高能弹幕搜索工具</h1>

      <div className="card">
        <div className="form-group">
          <label>上传 XML 文件</label>
          <input type="file" accept=".xml" onChange={handleFileChange} />
        </div>
        <div className="form-group">
          <label>输入关键词</label>
          <input
            type="text"
            placeholder="例如: nb"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <button onClick={handleSearch} disabled={loading}>
          {loading ? <span className="loading">正在加载中...</span> : "搜索"}
        </button>
      </div>

      {(summaries.length > 0 || processedResults.length > 0) && (
        <div className="result-container">
          {summaries.length > 0 && (
            <div className="result-column">
              <div className="card summary-card">
                <div className="card-header">
                  <h5>匹配字段频率</h5>
                  <button
                    onClick={() => setSortBy(sortBy === 'count' ? 'time' : 'count')}
                    className="sort-button"
                  >
                    {sortBy === 'count' ? '按时间排序' : '按次数排序'}
                  </button>
                </div>
                <ul className="result-list">
                  {sortedSummaries.map((s, i) => (
                    <li
                      key={i}
                      className="result-item clickable"
                      onClick={() => handleTimeRangeClick(s.startTime, s.endTime)}
                    >
                      <span className="time-badge">
                        {s.startTime} → {s.endTime}
                      </span>
                      <span className="count-info">
                        “{submittedKeyword}”出现 {s.count} 次 持续{Math.floor(s.duration)}秒
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {processedResults.length > 0 && (
            <div className="result-column">
              <div className="card">
                <div className="card-header">
                  <h5>弹幕命中记录</h5>
                </div>
                <ul
                  className="result-list"
                  ref={resultsListRef}
                  style={{ maxHeight: "60vh" }}
                >
                  {processedResults.map((r, i) => {
                    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    return (
                      <li
                        key={i}
                        className="result-item"
                        data-time={r.seconds}
                        onClick={() => handleJumpToTime(r.seconds)}
                      >
                        <span className="time-badge">{r.time}</span>
                        <span className="content-text">
                          {r.text.split(new RegExp(`(${escapedKeyword})`, "gi")).map((part, index) =>
                            part.toLowerCase() === keyword.toLowerCase() ? (
                              <span key={index} className="keyword-highlight">
                                {part}
                              </span>
                            ) : (
                              part
                            )
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 完整弹幕视图 */}
      {currentTime !== null && (
        <>
        <div className="full-chat-backdrop" onClick={handleReturn} />
        <div className="full-chat-container">
          <div className="full-chat-header">
            <h5>完整弹幕内容（{currentTime}s）</h5>
            <button onClick={handleReturn} className="return-button">返回</button>
          </div>
          <div className="full-chat-list">
            {fullDanmuList.length > 0 ? (
              fullDanmuList.map((danmu, index) => (
                <div key={index} className="danmu-item">
                  <span className="time-badge">{danmu.time}</span>
                  <span className="content-text">{danmu.text}</span>
                </div>
              ))
            ) : (
              <p>暂无弹幕内容</p>
            )}
          </div>
        </div>
        </>
      )}

      {!loading &&
        summaries.length === 0 &&
        processedResults.length === 0 && (
          <p className="empty-state">暂无匹配内容</p>
        )}

      {/* 显示生成的 FFmpeg 命令 */}
      {generatedCommand && (
        <div className="generated-command">
          <h5>生成的 FFmpeg 命令：</h5>
          <textarea
            value={generatedCommand}
            onChange={(e) => setGeneratedCommand(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: "0.5rem", fontFamily: "monospace" }}
          />
          <button onClick={handleCopyCommand} className="copy-button">
            {isCopied ? "已复制" : "复制命令"}
          </button>
        </div>
      )}
    </div>
  );
}
