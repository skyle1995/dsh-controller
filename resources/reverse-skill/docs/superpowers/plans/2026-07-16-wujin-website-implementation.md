# 无限破甲官网 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成一个面向普通用户、移动端优先、可直接跳转购买 19.9 元体验 CDK 与 68 元永久 CDK 的无限破甲静态官网，并通过自动化测试和 GitHub Pages 发布。

**Architecture:** 在仓库中新建零运行时依赖的 `website/` 静态站点，使用语义化 HTML 承载已批准文案，CSS 负责深色科技视觉和响应式布局，少量原生 JavaScript 负责移动导航与 CTA 事件。购买与 CDK 签发继续使用现有第三方销售页，不在官网内新增支付后端；GitHub Actions 只发布 `website/` 目录。

**Tech Stack:** HTML5、CSS3、Vanilla JavaScript、Python 3 `unittest`、GitHub Pages、Microsoft Edge headless visual smoke test

## Global Constraints

- 目标用户是不会逆向、不熟悉代码和命令，但希望借助 AI 分析软件与未知文件的普通用户。
- 核心主张固定为“几年才能跨过的门槛，现在压缩成一句话”。
- 7 天体验版固定为 `¥19.9`，购买地址固定为 `https://pay.ldxp.cn/item/bz252j`。
- 永久版固定为 `¥68`，购买地址固定为 `https://pay.ldxp.cn/item/r778vo`。
- 永久版必须说明“当前授权版本永久使用”，不得暗示所有未来大版本免费。
- 当前一键自动配置客户端只写 Claude、Codex、Kiro；Cursor、Cline、Windsurf 以软件检测结果为准。
- EXE 运行环境固定为 Windows 10 / Windows 11 x64。
- 官网必须说明 EXE 不要求管理员权限，不擅自下载、安装或启动第三方工具。
- 不使用虚假倒计时、虚构评价、虚构用户数、虚构成功率、“100% 成功”或“一键破解所有软件”。
- 官网必须在 360px、768px、1280px 和 1440px 视口下可读，无水平滚动。
- 所有购买链接必须可键盘访问，外链使用 `target="_blank"` 与 `rel="noopener noreferrer"`。
- 页面必须遵守 `prefers-reduced-motion`，不能把关键信息只放在动画中。
- 不引入前端框架、打包器、远程字体、远程图标库或需要 Cookie 的分析脚本。
- 文案来源固定为 `docs/superpowers/specs/2026-07-16-wujin-website-sales-copy-design.md`。
- 执行时不得纳入当前工作区已有的 `RULES.md`、路由文件或 `skills/building-cdk-activation/` 改动。

---

## File Map

### New production files

- `website/index.html`：语义结构、完整销售文案、购买链接、SEO 元数据和 JSON-LD。
- `website/assets/site.css`：品牌变量、组件样式、响应式布局、无障碍与降级动画。
- `website/assets/site.js`：移动导航、CTA 事件、年份填充，不发起网络分析请求。
- `website/assets/brand-tech-logo.svg`：从启动器品牌资源复制的站点 Logo。
- `website/assets/client-claude.svg`：Claude 客户端标识。
- `website/assets/client-codex.svg`：Codex 客户端标识。
- `website/assets/client-kiro.svg`：Kiro 客户端标识。
- `website/assets/wujin-configurator.png`：由现有 EXE 配置界面截图生成的产品证据图。
- `website/.nojekyll`：禁止 GitHub Pages 进行 Jekyll 转换。
- `website/robots.txt`：允许抓取并声明 sitemap。
- `website/sitemap.xml`：声明官网首页地址。

### New verification files

- `tests/website/__init__.py`：网站测试包标记。
- `tests/website/test_site.py`：内容、链接、资源、可访问性、SEO 与发布工作流契约测试。
- `.github/workflows/deploy-website.yml`：测试通过后发布 `website/` 到 GitHub Pages。

### Existing files to modify

- `launcher/config/links.json`：Pages 健康检查通过后，把 `website` 改为官网地址。
- `launcher/tests/test_links.py`：锁定官网、体验、永久和文档链接。
- `README.md`：增加官网入口、价格和支持范围说明。

### Stable DOM interfaces

- Section IDs: `pain`, `workflow`, `comparison`, `scenarios`, `capabilities`, `setup`, `pricing`, `trust`, `faq`, `support`。
- CTA attributes: `data-cta="trial|permanent|support"` 和 `data-location="announcement|hero|comparison|capabilities|pricing|final|footer"`。
- Mobile navigation hooks: `[data-menu-button]`、`[data-mobile-menu]`、`data-open="true|false"`。
- CTA event: `window` 上派发 `wujin:cta`，`detail` 为 `{ product, location, href }`。

---

### Task 1: 建立网站销售与结构契约

**Files:**
- Create: `tests/website/__init__.py`
- Create: `tests/website/test_site.py`
- Create: `website/index.html`

**Interfaces:**
- Consumes: 已批准销售文案、固定价格、固定购买链接、稳定 DOM IDs。
- Produces: 可被 CSS、JavaScript、SEO 和部署任务复用的单页 DOM 契约。

- [ ] **Step 1: Write the failing sales-contract test**

创建空的 `tests/website/__init__.py`，并在 `tests/website/test_site.py` 写入：

```python
from __future__ import annotations

import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "website"
INDEX = SITE / "index.html"
TRIAL_URL = "https://pay.ldxp.cn/item/bz252j"
PERMANENT_URL = "https://pay.ldxp.cn/item/r778vo"
SITE_URL = "https://zhaoxuya520.github.io/reverse-skill/"


class SiteParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.links: list[dict[str, str]] = []
        self.images: list[dict[str, str]] = []
        self.scripts: list[dict[str, str]] = []
        self.stylesheets: list[dict[str, str]] = []
        self.buttons: list[dict[str, str]] = []
        self.html_attrs: dict[str, str] = {}
        self.h1_count = 0
        self.json_ld_chunks: list[str] = []
        self._json_ld = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        if tag == "html":
            self.html_attrs = values
        if values.get("id"):
            self.ids.add(values["id"])
        if tag == "a":
            self.links.append(values)
        elif tag == "img":
            self.images.append(values)
        elif tag == "script":
            self.scripts.append(values)
            self._json_ld = values.get("type") == "application/ld+json"
        elif tag == "link" and values.get("rel") == "stylesheet":
            self.stylesheets.append(values)
        elif tag == "button":
            self.buttons.append(values)
        elif tag == "h1":
            self.h1_count += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self._json_ld = False

    def handle_data(self, data: str) -> None:
        if self._json_ld:
            self.json_ld_chunks.append(data)


def parse_site() -> tuple[str, SiteParser]:
    html = INDEX.read_text(encoding="utf-8")
    parser = SiteParser()
    parser.feed(html)
    return html, parser


class WebsiteTests(unittest.TestCase):
    def test_sales_contract(self) -> None:
        html, parser = parse_site()
        required_copy = (
            "几年才能跨过的门槛",
            "你负责提出问题，AI 负责寻找路线",
            "¥19.9",
            "¥68",
            "¥48.1",
            "当前授权版本永久使用",
            "Windows 10 / 11 x64",
            "Claude、Codex、Kiro",
            "1606654577",
        )
        for text in required_copy:
            self.assertIn(text, html)

        expected_ids = {
            "pain", "workflow", "comparison", "scenarios", "capabilities",
            "setup", "pricing", "trust", "faq", "support",
        }
        self.assertTrue(expected_ids.issubset(parser.ids))
        self.assertEqual(parser.h1_count, 1)

    def test_purchase_links(self) -> None:
        _, parser = parse_site()
        trial = [link for link in parser.links if link.get("data-cta") == "trial"]
        permanent = [link for link in parser.links if link.get("data-cta") == "permanent"]
        self.assertGreaterEqual(len(trial), 2)
        self.assertGreaterEqual(len(permanent), 4)
        self.assertTrue(all(link.get("href") == TRIAL_URL for link in trial))
        self.assertTrue(all(link.get("href") == PERMANENT_URL for link in permanent))
        for link in trial + permanent:
            self.assertEqual(link.get("target"), "_blank")
            self.assertEqual(link.get("rel"), "noopener noreferrer")
            self.assertTrue(link.get("data-location"))

    def test_internal_anchors_and_local_assets_resolve(self) -> None:
        _, parser = parse_site()
        for link in parser.links:
            href = link.get("href", "")
            if href.startswith("#") and href != "#":
                self.assertIn(href[1:], parser.ids, href)

        local_refs = [image.get("src", "") for image in parser.images]
        local_refs += [script.get("src", "") for script in parser.scripts if script.get("src")]
        local_refs += [style.get("href", "") for style in parser.stylesheets]
        for ref in local_refs:
            parsed = urlparse(ref)
            self.assertFalse(parsed.scheme, ref)
            self.assertTrue((SITE / parsed.path).is_file(), ref)

    def test_accessibility_contract(self) -> None:
        html, parser = parse_site()
        self.assertEqual(parser.html_attrs.get("lang"), "zh-CN")
        self.assertIn('name="viewport"', html)
        self.assertIn('aria-label="主导航"', html)
        self.assertIn('href="#main-content"', html)
        self.assertTrue(all(image.get("alt") for image in parser.images))
        self.assertTrue(all(button.get("type") == "button" for button in parser.buttons))
        self.assertIn("prefers-reduced-motion", (SITE / "assets/site.css").read_text(encoding="utf-8"))

    def test_no_unapproved_claims_or_draft_markers(self) -> None:
        html, _ = parse_site()
        banned = (
            "100%成功", "支持所有软件", "所有未来版本免费", "example.com",
            "lorem ipsum", "T" + "BD", "T" + "ODO", "FI" + "XME",
        )
        lower = html.lower()
        for text in banned:
            self.assertNotIn(text.lower(), lower)

    def test_structured_data(self) -> None:
        _, parser = parse_site()
        payload = json.loads("".join(parser.json_ld_chunks))
        self.assertEqual(payload["@type"], "SoftwareApplication")
        self.assertEqual(payload["name"], "无限破甲")
        self.assertEqual(payload["operatingSystem"], "Windows 10, Windows 11")
        offers = {str(item["price"]): item["url"] for item in payload["offers"]}
        self.assertEqual(offers, {"19.9": TRIAL_URL, "68": PERMANENT_URL})

    def test_pages_support_files(self) -> None:
        self.assertEqual((SITE / ".nojekyll").read_text(encoding="utf-8"), "")
        robots = (SITE / "robots.txt").read_text(encoding="utf-8")
        sitemap = (SITE / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn(f"Sitemap: {SITE_URL}sitemap.xml", robots)
        self.assertIn(f"<loc>{SITE_URL}</loc>", sitemap)

    def test_deploy_workflow_contract(self) -> None:
        workflow = (ROOT / ".github/workflows/deploy-website.yml").read_text(encoding="utf-8")
        for required in (
            "python -m unittest tests.website.test_site -v",
            "actions/configure-pages@v5",
            "actions/upload-pages-artifact@v3",
            "actions/deploy-pages@v4",
            "path: website",
        ):
            self.assertIn(required, workflow)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the first test and verify the red state**

Run:

```powershell
python -m unittest tests.website.test_site.WebsiteTests.test_sales_contract -v
```

Expected: ERROR with `FileNotFoundError` for `website/index.html`.

- [ ] **Step 3: Create the semantic HTML page**

创建 `website/index.html`。文案必须逐段取自销售文案设计，DOM 使用以下完整骨架；省略号不能进入文件，实施时在每个已标明的容器内放入对应设计章节的原文卡片：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>无限破甲｜把几年才能建立的分析思路，装进你的 AI</title>
  <meta name="description" content="不会逆向、不懂代码，也能让 AI 帮你分析安卓安装包、电脑程序、网页请求、抓包和未知文件。7 天体验 19.9 元，永久版 68 元。">
  <meta name="theme-color" content="#090914">
  <link rel="icon" href="assets/brand-tech-logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/site.css">
  <script defer src="assets/site.js"></script>
</head>
<body>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="announcement">
    <span>7 天体验仅需 ¥19.9</span>
    <span aria-hidden="true">｜</span>
    <strong>永久版 ¥68｜多花 ¥48.1，直接长期拥有</strong>
    <a href="https://pay.ldxp.cn/item/r778vo" target="_blank" rel="noopener noreferrer" data-cta="permanent" data-location="announcement">立即获得</a>
  </div>
  <header class="site-header">
    <a class="brand" href="#top" aria-label="无限破甲首页">
      <img src="assets/brand-tech-logo.svg" alt="无限破甲标志">
      <span>无限破甲</span>
    </a>
    <nav aria-label="主导航">
      <button class="menu-button" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-button>菜单</button>
      <div class="nav-links" id="mobile-menu" data-mobile-menu data-open="false">
        <a href="#capabilities">它能做什么</a>
        <a href="#scenarios">使用场景</a>
        <a href="#setup">三步开始</a>
        <a href="#pricing">版本价格</a>
        <a href="#faq">常见问题</a>
        <a class="button button-small" href="https://pay.ldxp.cn/item/r778vo" target="_blank" rel="noopener noreferrer" data-cta="permanent" data-location="header">立即获得</a>
      </div>
    </nav>
  </header>
  <main id="main-content">
    <section class="hero" id="top">
      <div class="hero-copy">
        <p class="eyebrow">不是再给 AI 一段提示词，而是给它一套知道如何推进任务的分析思路</p>
        <h1>几年才能跨过的门槛，<span>现在压缩成一句话。</span></h1>
        <p class="hero-lead">不会逆向，不懂代码，甚至不知道应该使用什么工具？没关系。把安卓安装包、电脑程序、网页、抓包或未知文件交给 AI，再告诉它你想知道什么。</p>
        <p class="hero-emphasis">无限破甲，让你的 AI 从“只会回答”，升级为“知道该从哪里开始分析”。</p>
        <div class="cta-row">
          <a class="button button-primary" href="https://pay.ldxp.cn/item/r778vo" target="_blank" rel="noopener noreferrer" data-cta="permanent" data-location="hero">立即永久获得 · ¥68</a>
          <a class="button button-secondary" href="https://pay.ldxp.cn/item/bz252j" target="_blank" rel="noopener noreferrer" data-cta="trial" data-location="hero">先体验 7 天 · ¥19.9</a>
        </div>
        <p class="microcopy">永久版仅比体验版多 ¥48.1。一次购买，当前授权版本永久使用。</p>
        <ul class="trust-chips" aria-label="产品特点">
          <li>Windows 10 / 11 x64</li><li>单文件 EXE</li><li>自动备份原配置</li><li>配置完成回读验证</li><li>无需管理员权限</li>
        </ul>
      </div>
      <figure class="hero-product">
        <img src="assets/wujin-configurator.png" alt="无限破甲一键配置界面">
        <figcaption>选择 AI 客户端，输入 CDK，一键完成项目接入。</figcaption>
      </figure>
    </section>

    <section class="section" id="pain" aria-labelledby="pain-title">
      <p class="eyebrow">为什么总在开始之前放弃</p>
      <h2 id="pain-title">你不是学不会。只是第一道门槛，就已经复杂到让人想放弃。</h2>
      <p class="section-lead">你可能只是想知道一个程序做了什么，却被工具、命令、环境、报错和几十篇互相矛盾的教程挡在门外。</p>
      <div class="card-grid pain-grid">
        <article><h3>工具太多</h3><p>下载了一堆软件，却不知道先打开哪个。每个教程推荐的工具还不一样。</p></article>
        <article><h3>命令太杂</h3><p>复制命令就报错，搜索报错又出现新的报错。分析还没开始，耐心已经用完。</p></article>
        <article><h3>AI 只会解释</h3><p>它能讲很多概念，却经常不知道你的文件该走哪条路线。</p></article>
        <article><h3>不知道怎样提问</h3><p>面对陌生文件，你甚至说不出专业名称，只能问“帮我看看这是什么”。</p></article>
      </div>
      <blockquote>你缺的不是更多教程。<strong>你缺的是一套能替你判断“接下来怎么办”的分析路线。</strong></blockquote>
    </section>

    <section class="section section-accent" id="workflow" aria-labelledby="workflow-title">
      <p class="eyebrow">把复杂交给系统</p>
      <h2 id="workflow-title">你负责提出问题，AI 负责寻找路线。</h2>
      <p class="section-lead">无限破甲把任务判断、方法选择、工具检查、执行步骤、证据整理和结果输出编排成一套可被 AI 调用的工作流。</p>
      <ol class="steps"><li>识别任务</li><li>选择路线</li><li>检查工具</li><li>推进分析</li><li>整理证据</li><li>输出结论</li></ol>
    </section>

    <section class="section" id="comparison" aria-labelledby="comparison-title">
      <h2 id="comparison-title">同一个问题，两种完全不同的开始。</h2>
      <div class="comparison-grid">
        <article class="comparison-before"><h3>没有无限破甲</h3><ul><li>先搜索文件类型</li><li>再搜索工具</li><li>配置环境</li><li>复制命令</li><li>处理报错</li><li>不知道下一步而放弃</li></ul></article>
        <article class="comparison-after"><h3>拥有无限破甲</h3><ul><li>把问题交给 AI</li><li>用普通话说明目标</li><li>AI 判断路线</li><li>检查本机能力</li><li>明确缺失条件</li><li>整理结论与下一步</li></ul></article>
      </div>
      <a class="button button-primary section-cta" href="https://pay.ldxp.cn/item/r778vo" target="_blank" rel="noopener noreferrer" data-cta="permanent" data-location="comparison">让我的 AI 先开始 · ¥68</a>
    </section>

    <section class="section" id="scenarios" aria-labelledby="scenarios-title">
      <p class="eyebrow">不会术语也能问</p>
      <h2 id="scenarios-title">像平时一样提问就够了。</h2>
      <div class="card-grid scenario-grid">
        <article><h3>安卓应用</h3><p>“这个安卓安装包为什么打不开？”</p><p>“帮我找出闪退的原因。”</p></article>
        <article><h3>电脑程序</h3><p>“这个 EXE 启动后到底做了什么？”</p><p>“这个 DLL 有什么作用？”</p></article>
        <article><h3>网页与请求</h3><p>“点击登录以后，网页发送了什么？”</p><p>“请求参数是怎样生成的？”</p></article>
        <article><h3>抓包与接口</h3><p>“这份抓包里每一步发生了什么？”</p><p>“这个接口为什么返回错误？”</p></article>
        <article><h3>未知文件与故障</h3><p>“我不知道这是什么文件，先帮我判断。”</p><p>“找出程序崩溃的真正原因。”</p></article>
        <article><h3>CTF 与安全练习</h3><p>“这道题应该从哪里开始？”</p><p>“把分析过程整理成报告。”</p></article>
      </div>
    </section>

    <section class="section section-accent" id="capabilities" aria-labelledby="capabilities-title">
      <p class="eyebrow">不是临时拼出来的提示词</p>
      <h2 id="capabilities-title">你看到的是一个 EXE，接入的是一整套专业方法。</h2>
      <div class="metric-grid"><div><strong>20+</strong><span>核心安全与逆向模块</span></div><div><strong>40+</strong><span>CTF 专项技能工作流</span></div><div><strong>6 步</strong><span>从任务识别走向结论</span></div></div>
      <div class="card-grid capability-grid">
        <article><h3>先判断，再动手</h3><p>先判断任务类型、用户目标和工具条件，再进入对应工作流。</p></article>
        <article><h3>知道电脑里有什么</h3><p>生成本机工具状态索引，避免反复尝试不存在的工具路径。</p></article>
        <article><h3>复用已经踩过的坑</h3><p>优先参考已沉淀的命令、问题、路径和解决方式。</p></article>
        <article><h3>结果不只是一段聊天</h3><p>强调证据、过程、结论和下一步，并可继续整理成报告或图表。</p></article>
      </div>
      <a class="button button-primary section-cta" href="https://pay.ldxp.cn/item/r778vo" target="_blank" rel="noopener noreferrer" data-cta="permanent" data-location="capabilities">接入整套分析大脑 · ¥68</a>
    </section>

    <section class="section" id="setup" aria-labelledby="setup-title">
      <p class="eyebrow">复杂能力，简单开始</p>
      <h2 id="setup-title">三步完成接入。</h2>
      <ol class="setup-steps"><li><span>01</span><h3>打开 EXE</h3><p>运行无限破甲单文件程序。</p></li><li><span>02</span><h3>选择客户端并激活</h3><p>选择 Claude、Codex 或 Kiro，输入 CDK。</p></li><li><span>03</span><h3>一键配置</h3><p>自动部署、备份、合并并回读验证。</p></li></ol>
      <p class="trust-note">不要求管理员权限，不偷偷下载第三方软件，不修改你没有选择的客户端。配置前有备份，配置后有验证。</p>
    </section>

    <section class="section pricing-section" id="pricing" aria-labelledby="pricing-title">
      <p class="eyebrow">低门槛试用，一次买断更划算</p>
      <h2 id="pricing-title">用一顿饭的钱，跨过最容易劝退你的第一道门槛。</h2>
      <div class="pricing-grid">
        <article class="price-card"><p class="price-name">7 天体验版</p><p class="price"><span>¥</span>19.9</p><ul><li>首次激活起 7 天</li><li>完整体验当前版本配置流程</li><li>适合先确认使用方式</li></ul><a class="button button-secondary" href="https://pay.ldxp.cn/item/bz252j" target="_blank" rel="noopener noreferrer" data-cta="trial" data-location="pricing">先体验 7 天 · ¥19.9</a></article>
        <article class="price-card price-card-featured"><p class="badge">更划算｜只比体验版多 ¥48.1</p><p class="price-name">永久版</p><p class="price"><span>¥</span>68</p><ul><li>当前授权版本永久使用</li><li>无需按月续费</li><li>一次激活，长期保留</li></ul><a class="button button-primary" href="https://pay.ldxp.cn/item/r778vo" target="_blank" rel="noopener noreferrer" data-cta="permanent" data-location="pricing">直接永久获得 · ¥68</a></article>
      </div>
      <p class="price-close">只要它替你少走一次弯路、少折腾一次环境，68 元的价值就已经非常清楚。</p>
    </section>

    <section class="section" id="trust" aria-labelledby="trust-title">
      <h2 id="trust-title">能做到什么，我们说清楚；使用条件，也说清楚。</h2>
      <div class="card-grid trust-grid">
        <article><h3>当前自动接入</h3><p>当前经过验证的一键配置客户端为 Claude、Codex、Kiro。其他客户端以软件检测结果为准。</p></article>
        <article><h3>运行环境</h3><p>支持 Windows 10 / 11 x64，并需要提前准备受支持的 AI 客户端。</p></article>
        <article><h3>第三方工具</h3><p>不会擅自下载、安装或启动第三方工具。任务需要额外工具时，AI 会明确说明。</p></article>
        <article><h3>结果边界</h3><p>提供清晰起点、路线和执行框架，不承诺所有目标都能瞬间得到完整答案。</p></article>
      </div>
    </section>

    <section class="section" id="faq" aria-labelledby="faq-title">
      <h2 id="faq-title">购买前，你可能还想问。</h2>
      <div class="faq-list">
        <details><summary>我完全不会技术，买了能用吗？</summary><p>可以。你只需要提供文件、日志、代码、截图或目标描述，并说明你想知道什么。</p></details>
        <details><summary>它能自动破解所有软件吗？</summary><p>没有任何工具能保证自动处理所有软件。无限破甲帮助 AI 识别任务、选择方法、检查工具并推进分析。</p></details>
        <details><summary>它和普通提示词有什么区别？</summary><p>它提供按场景拆分的工作流、工具入口、路由规则、经验记录和报告方式。</p></details>
        <details><summary>普通 ChatGPT 网页能直接使用吗？</summary><p>产品面向支持项目规则、技能或 MCP 接入的 AI 客户端。普通聊天网页不等同于受支持客户端。</p></details>
        <details><summary>体验版和永久版有什么区别？</summary><p>体验版首次激活起 7 天，售价 19.9 元。永久版售价 68 元，当前授权版本永久有效。</p></details>
      </div>
    </section>

    <section class="final-cta" id="support">
      <p class="eyebrow">别再让“我不懂技术”结束每一次好奇</p>
      <h2>你可以继续把陌生程序当成黑箱。<span>也可以从今天开始，让 AI 帮你往里面看。</span></h2>
      <div class="cta-row"><a class="button button-primary" href="https://pay.ldxp.cn/item/r778vo" target="_blank" rel="noopener noreferrer" data-cta="permanent" data-location="final">给我的 AI 装上分析大脑 · ¥68</a><a class="button button-secondary" href="https://pay.ldxp.cn/item/bz252j" target="_blank" rel="noopener noreferrer" data-cta="trial" data-location="final">先用 ¥19.9 体验 7 天</a></div>
      <p>购买或配置遇到问题？客服 QQ：<strong>1606654577</strong></p>
      <button class="text-button" type="button" data-copy-support="1606654577">复制客服 QQ</button>
    </section>
  </main>
  <footer class="site-footer"><p>无限破甲是一款面向 Windows 的 AI 分析能力一键配置器。</p><nav aria-label="页脚导航"><a href="https://docs.qq.com/doc/DV3VIeWxUZXFVb3dj" target="_blank" rel="noopener noreferrer">使用文档</a><a href="https://pay.ldxp.cn/shop/86MM0VJP" target="_blank" rel="noopener noreferrer">购买 CDK</a><a href="#support" data-cta="support" data-location="footer">联系客服</a></nav><p>© <span data-current-year>2026</span> 无限破甲。保留所有权利。</p></footer>
</body>
</html>
```

- [ ] **Step 4: Run the sales and purchase-link tests**

Run:

```powershell
python -m unittest tests.website.test_site.WebsiteTests.test_sales_contract tests.website.test_site.WebsiteTests.test_purchase_links -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the content contract**

```powershell
git add tests/website/__init__.py tests/website/test_site.py website/index.html
git commit -m "feat: add wujin website sales structure"
```

---

### Task 2: 加入品牌资源与响应式视觉系统

**Files:**
- Create: `website/assets/brand-tech-logo.svg`
- Create: `website/assets/client-claude.svg`
- Create: `website/assets/client-codex.svg`
- Create: `website/assets/client-kiro.svg`
- Create: `website/assets/wujin-configurator.png`
- Create: `website/assets/site.css`

**Interfaces:**
- Consumes: Task 1 的 class names、HTML asset paths、现有启动器品牌资源。
- Produces: 在 360–1440px 视口可读的深色品牌视觉与全部本地资源。

- [ ] **Step 1: Run the local-asset test and verify the red state**

Run:

```powershell
python -m unittest tests.website.test_site.WebsiteTests.test_internal_anchors_and_local_assets_resolve -v
```

Expected: FAIL because `website/assets/site.css` and local images do not exist.

- [ ] **Step 2: Copy reviewed brand assets**

Run:

```powershell
New-Item -ItemType Directory -Force -Path website\assets | Out-Null
Copy-Item -LiteralPath launcher\app\resources\brand-tech-logo.svg -Destination website\assets\brand-tech-logo.svg
Copy-Item -LiteralPath launcher\app\resources\client-logos\claude.svg -Destination website\assets\client-claude.svg
Copy-Item -LiteralPath launcher\app\resources\client-logos\codex.svg -Destination website\assets\client-codex.svg
Copy-Item -LiteralPath launcher\app\resources\client-logos\kiro.svg -Destination website\assets\client-kiro.svg
Copy-Item -LiteralPath dist\截图2.png -Destination website\assets\wujin-configurator.png
```

Expected: five files exist under `website/assets/`; `wujin-configurator.png` is approximately 210 KB.

- [ ] **Step 3: Implement the visual system**

创建 `website/assets/site.css`，使用以下 exact tokens and component rules。所有后续样式只复用这些变量：

```css
:root {
  color-scheme: dark;
  --bg: #080812;
  --surface: #11111f;
  --surface-strong: #17172a;
  --text: #f7f7fb;
  --muted: #a7a7b9;
  --line: rgba(255, 255, 255, 0.11);
  --red: #ff3b3b;
  --red-strong: #ff2020;
  --violet: #8c52ff;
  --green: #44d28b;
  --shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
  --radius: 24px;
  --max: 1180px;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: radial-gradient(circle at 75% 10%, rgba(140,82,255,.18), transparent 32rem), var(--bg); color: var(--text); font-family: Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.65; }
a { color: inherit; }
img { display: block; max-width: 100%; }
.skip-link { position: fixed; left: 1rem; top: -4rem; z-index: 100; padding: .7rem 1rem; background: #fff; color: #000; border-radius: .5rem; }
.skip-link:focus { top: 1rem; }
.announcement { min-height: 40px; display: flex; justify-content: center; align-items: center; gap: .45rem; padding: .55rem 1rem; background: linear-gradient(90deg, #8b1010, #e52b2b); font-size: .9rem; text-align: center; }
.announcement a { margin-left: .5rem; font-weight: 800; }
.site-header { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; width: min(100% - 2rem, var(--max)); margin: 0 auto; padding: 1rem 0; background: rgba(8,8,18,.78); backdrop-filter: blur(20px); }
.brand { display: inline-flex; gap: .65rem; align-items: center; font-weight: 900; text-decoration: none; }
.brand img { width: 34px; height: 34px; }
.nav-links { display: flex; gap: 1.25rem; align-items: center; }
.nav-links > a { color: var(--muted); text-decoration: none; font-size: .94rem; }
.nav-links > a:hover, .nav-links > a:focus-visible { color: var(--text); }
.menu-button { display: none; }
.button { display: inline-flex; justify-content: center; align-items: center; min-height: 50px; padding: .8rem 1.25rem; border: 1px solid transparent; border-radius: 14px; font-weight: 850; text-decoration: none; transition: transform .2s ease, border-color .2s ease, background .2s ease; }
.button:hover { transform: translateY(-2px); }
.button:focus-visible, summary:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid rgba(255,255,255,.85); outline-offset: 3px; }
.button-primary { color: #fff; background: linear-gradient(135deg, var(--red), var(--red-strong)); box-shadow: 0 15px 45px rgba(255,32,32,.25); }
.button-secondary { color: var(--text); background: rgba(255,255,255,.055); border-color: var(--line); }
.button-small { min-height: 40px; padding: .55rem .9rem; color: #fff !important; background: var(--red); }
.hero, .section, .final-cta, .site-footer { width: min(100% - 2rem, var(--max)); margin-inline: auto; }
.hero { display: grid; grid-template-columns: 1.05fr .95fr; gap: clamp(2rem, 6vw, 5rem); align-items: center; min-height: 760px; padding: 5rem 0 6rem; }
.eyebrow { margin: 0 0 1rem; color: #ff7777; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; }
h1, h2, h3 { margin-top: 0; line-height: 1.15; }
h1 { margin-bottom: 1.4rem; font-size: clamp(3rem, 7vw, 6.6rem); letter-spacing: -.06em; }
h1 span, .final-cta h2 span { display: block; color: transparent; background: linear-gradient(100deg, #fff, #ff6363 48%, #9f73ff); -webkit-background-clip: text; background-clip: text; }
h2 { max-width: 900px; font-size: clamp(2.15rem, 4.5vw, 4.2rem); letter-spacing: -.045em; }
h3 { font-size: 1.18rem; }
.hero-lead, .section-lead { max-width: 760px; color: var(--muted); font-size: clamp(1.05rem, 1.8vw, 1.28rem); }
.hero-emphasis { max-width: 730px; font-size: 1.2rem; font-weight: 800; }
.cta-row { display: flex; flex-wrap: wrap; gap: .8rem; margin: 2rem 0 1rem; }
.microcopy { color: var(--muted); font-size: .9rem; }
.trust-chips { display: flex; flex-wrap: wrap; gap: .55rem; padding: 0; list-style: none; }
.trust-chips li { padding: .45rem .7rem; border: 1px solid var(--line); border-radius: 999px; color: #d8d8e2; font-size: .82rem; }
.hero-product { margin: 0; padding: .8rem; border: 1px solid var(--line); border-radius: 28px; background: linear-gradient(145deg, rgba(255,255,255,.08), rgba(255,255,255,.02)); box-shadow: var(--shadow); transform: perspective(1200px) rotateY(-4deg) rotateX(2deg); }
.hero-product img { border-radius: 18px; }
.hero-product figcaption { padding: .9rem .4rem .2rem; color: var(--muted); font-size: .84rem; text-align: center; }
.section { padding: clamp(5rem, 10vw, 9rem) 0; }
.section-accent { position: relative; }
.section-accent::before { content: ""; position: absolute; inset: 8% -6%; z-index: -1; border: 1px solid var(--line); border-radius: 40px; background: linear-gradient(145deg, rgba(255,59,59,.07), rgba(140,82,255,.08)); }
.card-grid { display: grid; gap: 1rem; margin-top: 2.5rem; }
.pain-grid, .capability-grid, .trust-grid { grid-template-columns: repeat(4, 1fr); }
.scenario-grid { grid-template-columns: repeat(3, 1fr); }
.card-grid article, .comparison-grid article, .price-card { padding: 1.6rem; border: 1px solid var(--line); border-radius: var(--radius); background: rgba(17,17,31,.82); }
.card-grid p, .comparison-grid li, .price-card li { color: var(--muted); }
blockquote { margin: 3rem 0 0; padding: 1.5rem 1.8rem; border-left: 4px solid var(--red); background: rgba(255,59,59,.06); font-size: 1.2rem; }
blockquote strong { display: block; margin-top: .3rem; }
.steps { display: grid; grid-template-columns: repeat(6, 1fr); gap: .65rem; padding: 0; list-style: none; counter-reset: step; }
.steps li { padding: 1.1rem .7rem; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); text-align: center; }
.steps li::before { counter-increment: step; content: "0" counter(step); display: block; color: var(--red); font-weight: 900; }
.comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; margin-top: 2.5rem; }
.comparison-before { opacity: .76; }
.comparison-after { border-color: rgba(68,210,139,.45) !important; background: linear-gradient(145deg, rgba(68,210,139,.1), rgba(17,17,31,.85)) !important; }
.section-cta { margin-top: 2rem; }
.metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 2.5rem 0; }
.metric-grid div { padding: 1.5rem; border-block: 1px solid var(--line); }
.metric-grid strong { display: block; color: #ff6a6a; font-size: 2.8rem; }
.metric-grid span { color: var(--muted); }
.setup-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; padding: 0; list-style: none; }
.setup-steps li { padding: 1.8rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.setup-steps span { color: var(--red); font-size: 2rem; font-weight: 900; }
.trust-note { margin-top: 1.5rem; padding: 1.25rem; border-radius: 16px; background: rgba(68,210,139,.08); color: #bff7d9; }
.pricing-section { text-align: center; }
.pricing-section h2 { margin-inline: auto; }
.pricing-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 430px)); justify-content: center; gap: 1.2rem; margin-top: 3rem; text-align: left; }
.price-card { position: relative; display: flex; flex-direction: column; min-height: 430px; }
.price-card-featured { border-color: rgba(255,59,59,.62); transform: translateY(-10px); box-shadow: 0 22px 80px rgba(255,32,32,.15); }
.badge { align-self: flex-start; margin: 0 0 1rem; padding: .35rem .65rem; border-radius: 999px; background: var(--red); font-size: .78rem; font-weight: 850; }
.price-name { color: var(--muted); }
.price { margin: .2rem 0 1rem; font-size: 4rem; font-weight: 950; letter-spacing: -.05em; }
.price span { font-size: 1.5rem; vertical-align: top; }
.price-card ul { flex: 1; padding-left: 1.2rem; }
.price-close { margin-top: 2rem; color: var(--muted); }
.faq-list { max-width: 900px; margin-top: 2.5rem; }
.faq-list details { border-top: 1px solid var(--line); }
.faq-list details:last-child { border-bottom: 1px solid var(--line); }
.faq-list summary { padding: 1.3rem 0; cursor: pointer; font-size: 1.08rem; font-weight: 800; }
.faq-list p { margin-top: 0; padding-bottom: 1.3rem; color: var(--muted); }
.final-cta { margin-block: 5rem; padding: clamp(3rem, 7vw, 6rem); border: 1px solid rgba(255,59,59,.3); border-radius: 36px; background: radial-gradient(circle at 70% 0%, rgba(140,82,255,.25), transparent 42%), linear-gradient(145deg, rgba(255,59,59,.12), rgba(17,17,31,.9)); text-align: center; box-shadow: var(--shadow); }
.final-cta h2 { margin-inline: auto; }
.final-cta .cta-row { justify-content: center; }
.text-button { border: 0; background: transparent; color: #ff8d8d; text-decoration: underline; cursor: pointer; }
.site-footer { display: grid; grid-template-columns: 1.2fr 1fr auto; gap: 1rem; align-items: center; padding: 2rem 0 3rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .88rem; }
.site-footer nav { display: flex; flex-wrap: wrap; gap: 1rem; }

@media (max-width: 960px) {
  .hero { grid-template-columns: 1fr; min-height: auto; }
  .hero-product { transform: none; }
  .pain-grid, .capability-grid, .trust-grid, .scenario-grid { grid-template-columns: repeat(2, 1fr); }
  .steps { grid-template-columns: repeat(3, 1fr); }
  .menu-button { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; padding: .55rem .8rem; background: var(--surface); color: var(--text); }
  .nav-links { display: none; position: absolute; left: 0; right: 0; top: 68px; flex-direction: column; align-items: stretch; padding: 1rem; border: 1px solid var(--line); border-radius: 18px; background: #11111f; box-shadow: var(--shadow); }
  .nav-links[data-open="true"] { display: flex; }
}

@media (max-width: 640px) {
  .announcement { flex-wrap: wrap; }
  .announcement span[aria-hidden="true"] { display: none; }
  h1 { font-size: clamp(2.75rem, 14vw, 4.4rem); }
  .hero { padding-top: 3rem; }
  .cta-row, .cta-row .button { width: 100%; }
  .pain-grid, .capability-grid, .trust-grid, .scenario-grid, .comparison-grid, .setup-steps, .pricing-grid, .metric-grid { grid-template-columns: 1fr; }
  .steps { grid-template-columns: repeat(2, 1fr); }
  .price-card-featured { transform: none; }
  .site-footer { grid-template-columns: 1fr; text-align: center; }
  .site-footer nav { justify-content: center; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
```

- [ ] **Step 4: Run asset and accessibility tests**

Run:

```powershell
python -m unittest tests.website.test_site.WebsiteTests.test_internal_anchors_and_local_assets_resolve tests.website.test_site.WebsiteTests.test_accessibility_contract -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit brand and responsive layout**

```powershell
git add website/assets tests/website/test_site.py
git commit -m "feat: style wujin website for responsive sales"
```

---

### Task 3: 实现移动导航、客服复制与 CTA 事件

**Files:**
- Create: `website/assets/site.js`
- Modify: `tests/website/test_site.py`

**Interfaces:**
- Consumes: `[data-menu-button]`、`[data-mobile-menu]`、`[data-cta]`、`[data-copy-support]`、`[data-current-year]`。
- Produces: `wujin:cta` CustomEvent，移动导航状态和客服复制反馈。

- [ ] **Step 1: Add the failing JavaScript-contract test**

在 `WebsiteTests` 中加入：

```python
def test_javascript_contract(self) -> None:
    script = (SITE / "assets/site.js").read_text(encoding="utf-8")
    for required in (
        'querySelector("[data-menu-button]")',
        'querySelectorAll("[data-cta]")',
        'new CustomEvent("wujin:cta"',
        "navigator.clipboard.writeText",
        'querySelector("[data-current-year]")',
    ):
        self.assertIn(required, script)
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```powershell
python -m unittest tests.website.test_site.WebsiteTests.test_javascript_contract -v
```

Expected: ERROR because `website/assets/site.js` does not exist.

- [ ] **Step 3: Implement dependency-free interactions**

创建 `website/assets/site.js`：

```javascript
(() => {
  "use strict";

  const menuButton = document.querySelector("[data-menu-button]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");

  const closeMenu = () => {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute("aria-expanded", "false");
    mobileMenu.dataset.open = "false";
  };

  if (menuButton && mobileMenu) {
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      mobileMenu.dataset.open = String(!open);
    });

    mobileMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  }

  document.querySelectorAll("[data-cta]").forEach((link) => {
    link.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("wujin:cta", {
        detail: {
          product: link.dataset.cta,
          location: link.dataset.location,
          href: link.href,
        },
      }));
    });
  });

  const supportButton = document.querySelector("[data-copy-support]");
  if (supportButton) {
    supportButton.addEventListener("click", async () => {
      const qq = supportButton.dataset.copySupport;
      try {
        await navigator.clipboard.writeText(qq);
        supportButton.textContent = "已复制客服 QQ";
      } catch (_error) {
        supportButton.textContent = `客服 QQ：${qq}`;
      }
    });
  }

  const year = document.querySelector("[data-current-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
```

- [ ] **Step 4: Syntax-check and run the contract test**

Run:

```powershell
node --check website/assets/site.js
python -m unittest tests.website.test_site.WebsiteTests.test_javascript_contract -v
```

Expected: Node exits 0 and the unittest PASSes.

- [ ] **Step 5: Commit interaction behavior**

```powershell
git add website/assets/site.js tests/website/test_site.py
git commit -m "feat: add wujin website interactions"
```

---

### Task 4: 完成 SEO、结构化数据与搜索引擎文件

**Files:**
- Modify: `website/index.html`
- Create: `website/.nojekyll`
- Create: `website/robots.txt`
- Create: `website/sitemap.xml`

**Interfaces:**
- Consumes: GitHub Pages canonical URL、固定价格与购买 URL。
- Produces: 可被搜索引擎解析的 `SoftwareApplication` JSON-LD 和 Pages 支持文件。

- [ ] **Step 1: Run SEO tests and verify the red state**

Run:

```powershell
python -m unittest tests.website.test_site.WebsiteTests.test_structured_data tests.website.test_site.WebsiteTests.test_pages_support_files -v
```

Expected: structured data JSON decoding fails and Pages support files are missing.

- [ ] **Step 2: Add exact social and canonical metadata**

在 `website/index.html` 的 `<head>` 中追加：

```html
<link rel="canonical" href="https://zhaoxuya520.github.io/reverse-skill/">
<meta property="og:type" content="website">
<meta property="og:locale" content="zh_CN">
<meta property="og:site_name" content="无限破甲">
<meta property="og:title" content="几年才能跨过的门槛，现在压缩成一句话">
<meta property="og:description" content="不会逆向、不懂代码，也能让 AI 帮你找到分析软件与未知文件的第一条路线。">
<meta property="og:url" content="https://zhaoxuya520.github.io/reverse-skill/">
<meta property="og:image" content="https://zhaoxuya520.github.io/reverse-skill/assets/wujin-configurator.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "无限破甲",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Windows 10, Windows 11",
  "description": "面向普通用户的 AI 分析能力一键配置器，用于部署 reverse-skill 工作流并接入支持的 AI 客户端。",
  "offers": [
    {
      "@type": "Offer",
      "name": "7 天体验版",
      "price": 19.9,
      "priceCurrency": "CNY",
      "url": "https://pay.ldxp.cn/item/bz252j",
      "availability": "https://schema.org/InStock"
    },
    {
      "@type": "Offer",
      "name": "永久版",
      "price": 68,
      "priceCurrency": "CNY",
      "url": "https://pay.ldxp.cn/item/r778vo",
      "availability": "https://schema.org/InStock"
    }
  ]
}
</script>
```

- [ ] **Step 3: Create Pages and crawler files**

创建空的 `website/.nojekyll`。

创建 `website/robots.txt`：

```text
User-agent: *
Allow: /
Sitemap: https://zhaoxuya520.github.io/reverse-skill/sitemap.xml
```

创建 `website/sitemap.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://zhaoxuya520.github.io/reverse-skill/</loc>
    <lastmod>2026-07-16</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

- [ ] **Step 4: Run SEO and claim-boundary tests**

Run:

```powershell
python -m unittest tests.website.test_site.WebsiteTests.test_structured_data tests.website.test_site.WebsiteTests.test_pages_support_files tests.website.test_site.WebsiteTests.test_no_unapproved_claims_or_draft_markers -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit SEO support**

```powershell
git add website/index.html website/.nojekyll website/robots.txt website/sitemap.xml
git commit -m "feat: add wujin website SEO metadata"
```

---

### Task 5: 配置测试门禁与 GitHub Pages 发布

**Files:**
- Create: `.github/workflows/deploy-website.yml`
- Modify: `tests/website/test_site.py`

**Interfaces:**
- Consumes: 完整 `website/` 目录、Python unittest contract。
- Produces: main 分支网站改动自动测试与 Pages artifact。

- [ ] **Step 1: Run workflow-contract test and verify the red state**

Run:

```powershell
python -m unittest tests.website.test_site.WebsiteTests.test_deploy_workflow_contract -v
```

Expected: ERROR because `.github/workflows/deploy-website.yml` does not exist.

- [ ] **Step 2: Create the Pages workflow**

创建 `.github/workflows/deploy-website.yml`：

```yaml
name: Deploy Wujin Website

on:
  push:
    branches: [main]
    paths:
      - "website/**"
      - "tests/website/**"
      - ".github/workflows/deploy-website.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Verify website contract
        run: python -m unittest tests.website.test_site -v

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: website
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Run workflow contract and full website test suite**

Run:

```powershell
python -m unittest tests.website.test_site.WebsiteTests.test_deploy_workflow_contract -v
python -m unittest tests.website.test_site -v
```

Expected: workflow test PASSes; all website tests PASS.

- [ ] **Step 4: Commit deployment automation**

```powershell
git add .github/workflows/deploy-website.yml tests/website/test_site.py
git commit -m "ci: deploy wujin website to pages"
```

---

### Task 6: 同步启动器官网链接与项目入口

**Files:**
- Modify: `launcher/config/links.json`
- Modify: `launcher/tests/test_links.py`
- Modify: `README.md`

**Interfaces:**
- Consumes: 已部署并返回 HTTP 200 的 Pages URL。
- Produces: EXE“官方网站”按钮与 README 指向新官网，同时保留体验、永久和文档地址。

- [ ] **Step 1: Add the failing launcher-link test**

在 `launcher/tests/test_links.py` 加入：

```python
def test_production_links_target_official_website_and_products(self):
    links_path = Path(__file__).resolve().parents[1] / "config" / "links.json"
    links = json.loads(links_path.read_text(encoding="utf-8"))
    self.assertEqual(links["website"], "https://zhaoxuya520.github.io/reverse-skill/")
    self.assertEqual(links["trial_cdk"], "https://pay.ldxp.cn/item/bz252j")
    self.assertEqual(links["permanent_cdk"], "https://pay.ldxp.cn/item/r778vo")
    self.assertEqual(links["docs"], "https://docs.qq.com/doc/DV3VIeWxUZXFVb3dj")
```

确认文件顶部已有 `import json` 和 `from pathlib import Path`；缺失时一并加入。

- [ ] **Step 2: Run the test and verify the red state**

Run:

```powershell
python -m unittest launcher.tests.test_links -v
```

Expected: FAIL because `website` still points to `https://pay.ldxp.cn/shop/86MM0VJP`.

- [ ] **Step 3: Update the production link config**

把 `launcher/config/links.json` 改为：

```json
{
  "website": "https://zhaoxuya520.github.io/reverse-skill/",
  "purchase": "https://pay.ldxp.cn/shop/86MM0VJP",
  "trial_cdk": "https://pay.ldxp.cn/item/bz252j",
  "permanent_cdk": "https://pay.ldxp.cn/item/r778vo",
  "docs": "https://docs.qq.com/doc/DV3VIeWxUZXFVb3dj",
  "support": ""
}
```

- [ ] **Step 4: Add the public website block to README**

在 README 主标题徽章区域后的导航中增加：

```markdown
## 无限破甲 Windows 一键配置器

面向普通用户的一键接入版本：不会逆向、不熟悉命令，也可以让支持的 AI 客户端按项目工作流开始分析。

- 官网：<https://zhaoxuya520.github.io/reverse-skill/>
- 7 天体验 CDK：¥19.9
- 永久 CDK：¥68，当前授权版本永久使用
- 当前一键自动配置：Claude、Codex、Kiro
- 系统：Windows 10 / Windows 11 x64
```

- [ ] **Step 5: Verify launcher links and website suite**

Run:

```powershell
python -m unittest launcher.tests.test_links -v
python -m unittest tests.website.test_site -v
```

Expected: both suites PASS.

- [ ] **Step 6: Commit public link integration**

```powershell
git add launcher/config/links.json launcher/tests/test_links.py README.md
git commit -m "docs: link launcher to wujin website"
```

---

### Task 7: 完成跨尺寸视觉 QA、链接检查与最终门禁

**Files:**
- Modify only if verification finds a concrete defect: `website/index.html`, `website/assets/site.css`, `website/assets/site.js`, `tests/website/test_site.py`

**Interfaces:**
- Consumes: 完整静态官网与全部自动化测试。
- Produces: 360px、768px、1280px、1440px 证据截图和上线检查结果。

- [ ] **Step 1: Run all automated verification**

Run:

```powershell
python -m unittest tests.website.test_site -v
python -m unittest launcher.tests.test_links -v
node --check website/assets/site.js
git diff --check
```

Expected: all unittests PASS; Node and `git diff --check` exit 0.

- [ ] **Step 2: Start a hidden local preview server**

Run:

```powershell
$server = Start-Process -FilePath python -ArgumentList '-m','http.server','4173','--directory','website' -WindowStyle Hidden -PassThru
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4173/ | Select-Object StatusCode
```

Expected: `StatusCode` is 200. Keep `$server.Id` for cleanup.

- [ ] **Step 3: Capture four viewport smoke-test images**

Run:

```powershell
$qa = Join-Path $env:TEMP 'wujin-website-qa'
New-Item -ItemType Directory -Force -Path $qa | Out-Null
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
& $edge --headless --disable-gpu --hide-scrollbars --window-size=360,800 --screenshot="$qa\360.png" http://127.0.0.1:4173/
& $edge --headless --disable-gpu --hide-scrollbars --window-size=768,900 --screenshot="$qa\768.png" http://127.0.0.1:4173/
& $edge --headless --disable-gpu --hide-scrollbars --window-size=1280,900 --screenshot="$qa\1280.png" http://127.0.0.1:4173/
& $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,1000 --screenshot="$qa\1440.png" http://127.0.0.1:4173/
Get-ChildItem -LiteralPath $qa | Select-Object Name,Length
```

Expected: four non-empty PNG files. Inspect each with the local image viewer and verify no clipped title, overlapping CTA, horizontal overflow, unreadable price card, or hidden focusable menu.

- [ ] **Step 4: Verify all external sales endpoints**

Run:

```powershell
$urls = @(
  'https://pay.ldxp.cn/shop/86MM0VJP',
  'https://pay.ldxp.cn/item/bz252j',
  'https://pay.ldxp.cn/item/r778vo',
  'https://docs.qq.com/doc/DV3VIeWxUZXFVb3dj'
)
foreach($url in $urls){
  try {
    $response = Invoke-WebRequest -UseBasicParsing -MaximumRedirection 5 -Method Head $url
    [PSCustomObject]@{Url=$url;Status=$response.StatusCode}
  } catch {
    [PSCustomObject]@{Url=$url;Status=$_.Exception.Response.StatusCode.value__}
  }
}
```

Expected: each endpoint returns 200–399. If a provider rejects HEAD, rerun only that URL with `-Method Get`.

- [ ] **Step 5: Stop the preview server**

Run:

```powershell
Stop-Process -Id $server.Id
```

Expected: the hidden preview process exits.

- [ ] **Step 6: Verify GitHub Pages after main deployment**

After the deployment workflow succeeds, run:

```powershell
$response = Invoke-WebRequest -UseBasicParsing https://zhaoxuya520.github.io/reverse-skill/
$response.StatusCode
$response.Content.Contains('几年才能跨过的门槛')
```

Expected: `200` and `True`.

- [ ] **Step 7: Commit only if QA required a fix**

If Step 3 or Step 4 required code changes, rerun Steps 1–6 and commit only the reviewed files:

```powershell
git add website tests/website
git commit -m "fix: resolve wujin website launch QA"
```

If no code changed, do not create an empty commit.

---

## Spec Coverage Matrix

| Sales-copy requirement | Implementation task |
|---|---|
| 首屏主张与双 CTA | Task 1 |
| 痛点、流程、前后对比 | Task 1 |
| 普通人提问场景 | Task 1 |
| 20+ 核心模块、40+ CTF 工作流 | Task 1 |
| 三步配置、备份与回读验证 | Task 1 |
| 19.9 / 68 / 48.1 价格锚定 | Task 1 |
| 兼容性、工具与结果边界 | Task 1 |
| 客服 QQ 与文档入口 | Tasks 1, 3 |
| 深色科技视觉与移动端 | Task 2 |
| 移动导航、复制与 CTA 事件 | Task 3 |
| SEO、OG、JSON-LD | Task 4 |
| 自动测试与 Pages 发布 | Task 5 |
| 启动器官网链接与 README | Task 6 |
| 多尺寸视觉证据与外链检查 | Task 7 |

## Release Gate

只有以下条件全部满足，官网才能替换启动器内的“官方网站”链接：

1. `python -m unittest tests.website.test_site -v` 全部通过。
2. `python -m unittest launcher.tests.test_links -v` 全部通过。
3. `node --check website/assets/site.js` 退出码为 0。
4. 四个视口截图均无标题截断、价格卡重叠或水平滚动。
5. 体验版、永久版、商店和文档地址均返回 200–399。
6. GitHub Pages 首页返回 HTTP 200 且包含主标题。
7. 页面明确写出支持客户端、第三方工具边界和永久版范围。
8. Git 提交未包含现有工作区的无关改动。
