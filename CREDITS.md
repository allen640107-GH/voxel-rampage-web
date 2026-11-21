# 方塊巨獸大暴走 Voxel Rampage — 製作名單與素材授權（CREDITS）

## 製作人／遊戲企劃：Allen Ho

## 美術與影片
- 封面主視覺（img/cover.jpg）、三隻巨獸頭像（img/m_trex.png、m_ape.png、m_ankylo.png，色鍵去背）、三個城市縮圖（img/s_downtown.jpg、s_harbor.jpg、s_neon.jpg）與**片頭影片**（video/intro.mp4 的畫面）皆以 **Grok Imagine（xAI）** 生成（GenerateImage / GenerateVideo）。
- 遊戲中的城市、建築、車輛與巨獸都是程式即時生成的體素（方塊）模型，沒有使用外部 3D 模型。
- 標題字型：**Noto Serif CJK TC Bold**（Google / Adobe，SIL Open Font License 1.1，https://github.com/notofonts/noto-cjk），以 fonttools 子集化為 `fonts/title.woff`。

## 程式庫
- **three.js r187**（`vendor/three.module.js`、`vendor/three.core.js`），MIT License，Copyright © 2010-2025 three.js authors，授權全文見 `vendor/three-LICENSE.txt`。以本地檔案提供，不依賴 CDN。

## 背景音樂（Kevin MacLeod，CC BY 4.0，需標示）
授權說明：https://incompetech.com/music/royalty-free/faq.html ・ 授權條款：https://creativecommons.org/licenses/by/4.0/
（與「恐龍防線」使用相同的已處理檔案：loudnorm -18 LUFS、96 kbps MP3）

| 用途 | 檔案 | 曲名 | 來源 |
|---|---|---|---|
| 片頭（video/intro.mp4 音軌，前 8 秒並淡出） | audio/music/intro.mp3 | Strength of the Titans | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Strength%20of%20the%20Titans.mp3 |
| 主選單 | audio/music/menu.mp3 | Five Armies | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Five%20Armies.mp3 |
| 現代市中心 | audio/music/level1.mp3 | Cretaceous Dawn | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cretaceous%20Dawn.mp3 |
| 黃昏海港 | audio/music/level2.mp3 | Dentaneosuchus Hunt | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Dentaneosuchus%20Hunt.mp3 |
| 霓虹夜城 | audio/music/boss.mp3 | Undaunted | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Undaunted.mp3 |
| 過關 | audio/music/win.mp3 | The Curtain Rises | https://incompetech.com/music/royalty-free/mp3-royaltyfree/The%20Curtain%20Rises.mp3 |
| 未過關 | audio/music/lose.mp3 | The Reveal | https://incompetech.com/music/royalty-free/mp3-royaltyfree/The%20Reveal.mp3 |

**標示文字（遊戲內「製作名單」畫面亦顯示）：**
```
"Strength of the Titans", "Five Armies", "Cretaceous Dawn", "Dentaneosuchus Hunt",
"Undaunted", "The Curtain Rises", "The Reveal"
Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0
https://creativecommons.org/licenses/by/4.0/
```

## 音效（全部 CC0 1.0 公眾領域，免標示；仍列出以示感謝）
授權條款：https://creativecommons.org/publicdomain/zero/1.0/ ・ 檔案沿用「恐龍防線」已裁切、混音、正規化的版本（單聲道 96 kbps MP3）。

| 遊戲檔（audio/sfx/） | 遊戲中用途 | 原始素材 | 作者 / 來源 |
|---|---|---|---|
| click, back, deny | 介面 | interface-sounds: click_002, back_002, error_004 | Kenney — https://kenney.nl/assets/interface-sounds |
| coin, achieve | 分數、過關 | rpg-audio handleCoins；magical_4 + confirmation_002 | Kenney；JaggedStone — https://opengameart.org/content/magic-spell-sfx |
| hit, rock | 方塊碎裂、腳步 | impactSoft_medium_001、impactMining_002/004 | Kenney — https://kenney.nl/assets/impact-sounds |
| boom, meteor, erupt | 汽車爆炸、踩踏衝擊、大樓倒塌 | sci-fi explosionCrunch_000/002、lowFrequency_explosion_000/001、thrusterFire_002/004 | Kenney — https://kenney.nl/assets/sci-fi-sounds |
| shatter | 玻璃碎裂 | IceShatters/LedasLuzta.ogg | IgnasD — https://opengameart.org/content/ice-breakingshattering |
| roar1, roar2 | 晶甲獸、巨猿吼叫 | roar_04, roar_02 | rubberduck — https://opengameart.org/content/80-cc0-creature-sfx |
| roar3 | 衝撞吼聲 | small_dino_raspy_calls | CaveboyTup — https://opengameart.org/content/small-dino-raspy-calls |
| boss | 暴龍吼叫（片頭也使用） | t-rex_calls + lowFrequency_explosion_000 | CaveboyTup — https://opengameart.org/content/t-rex-calls ；Kenney |
| wave | 吼叫衝擊波 | impactSoft_heavy_000/002/004 + roar_02 | Kenney；rubberduck |
| sk_stomp, sk_charge, sk_gust | 踩踏、衝撞、甩尾 | lowFrequency_explosion_001 + LedasLuzta；stomp_01 + impactSoft_heavy；swish-13/11 | Kenney；IgnasD；rubberduck；artisticdude — https://opengameart.org/content/swishes-sound-pack |

片頭影片音軌 = Strength of the Titans（CC BY 4.0）＋ boss 吼叫、boom 爆炸、shatter 碎裂音效（CC0）。
