import "../styles/globals.css";
import Head from 'next/head';
export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        {/* 网站名称（会显示在浏览器标签页） */}
        <title>弹幕时光机 - 高能弹幕搜索引擎</title>
        
        {/* 主要描述（SEO关键信息） */}
        <meta 
          name="description" 
          content="弹幕时光鸡..."
        />
        
      </Head>
      <Component {...pageProps} />
    </>
  );
}
