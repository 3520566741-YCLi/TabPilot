# 第三方资源登记（界面部分）

选型规矩：优先 MIT / BSD / Apache-2.0；固定版本；能用 CSS 重写就不加依赖；不用 GSAP；不用 Aceternity、Origin UI。
改过的地方在代码里加注释说明，所有动画都响应“减少动画”（系统设置 + 设置页开关）。

| 资源 | 来源 | 版本 | 许可 | 用在哪里 | 怎么用的 |
|---|---|---|---|---|---|
| lobe-icons（静态 SVG，单色版） | github.com/lobehub/lobe-icons，npm @lobehub/icons-static-svg | 取自 jsDelivr 的 latest（未固定，**待固定到具体版本**） | MIT | 引导页“选模型服务商”里各家提供商的图标 | 把 SVG 路径内嵌进 `renderer/renderer.js`，未装包。品牌标识归各自所有者，仅用于标识提供商 |
| Lucide 的 settings 图标 | lucide.dev | 未记录（**待补**） | ISC | 左上角设置按钮的齿轮 | 只复制图形路径 |
| reactbits.dev 的 Aurora / Spotlight Card / Tilted Card / Animated List | github.com/DavidHDev/react-bits | 按行为手写，未复制源码 | MIT + Commons Clause | 流动背景（极光）、“选模型服务商”详情卡的光斑与倾斜、列表依次弹入 | 用 CSS / 原生 JS 按效果重写，没有逐字拷贝 |
| animate-ui.com 的 Button / Highlight | github.com/imskyleen/animate-ui | 按效果手写，未复制源码 | MIT + Commons Clause | 按钮按下回弹、列表滑动高亮 | 用 CSS 重写 |

## 待办
- 固定 lobe-icons 和 Lucide 的具体版本号，并附上各自许可原文与版权声明。
