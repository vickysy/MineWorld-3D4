# Daniel Game Minecraft

这是一个完全基于 HTML5、Three.js 和 Web Audio API 构建的 3D《我的世界》网页版克隆项目。
包含代码合成音效、程序化地形生成，以及通过房间码连接的 WebRTC 多人联机。

## 功能特点
- **完全方块化材质**：没有绝对的圆形，所有贴图（草地、原木、泥土）均为 16x16 像素噪点随机生成。
- **极致的无限挖掘**：采用动态表面剔除算法，向下挖 10000 层也不会卡顿。
- **纯粹的合成音效**：没有使用任何现成的 MP3 录音。泥土的“沙沙”声、石头的“咣咣”声、玻璃破碎的“叮当”声全部通过 Web Audio API 纯代码实时物理合成。
- **多人联机**：房主创建房间后获得可复制的 12 位联机码。朋友加入时加载房主的世界，双方可以看到彼此并同步普通方块的放置和挖掘。
- **丰富的机制**：包含核弹爆炸、枪械射线检测、火把供电的熔炉、村民建造彩蛋、以及水下窒息（20秒）等物理机制。

## 如何运行单人游戏
可以直接打开 `game3d.html`，但要保留同目录的脚本文件。Three.js 依赖和联机服务需要联网。也可以启动本地服务器：

1. 确保你安装了 Python 3 或 Node.js
2. 在项目根目录下打开终端
3. 运行本地服务器：
   - Python: `python3 -m http.server 8000`
   - Node.js: `npx serve -p 8000`
4. 打开浏览器访问：[http://localhost:8000/game3d.html](http://localhost:8000/game3d.html)

## 如何联机
1. 双方打开同一个最新版网页，点击 **Play with Others**。
2. 房主点击 **Create Room**，等待显示 **Room ready.**，点击 **Copy** 把联机码发给朋友，再点击 **Enter Room**。
3. 朋友选择 **Join Room**，粘贴联机码，点击 **Join Room**。世界加载完成后点击 **Enter Room**。
4. 按 Esc 后点击 **Room** 可以复制联机码或点击 **Leave Room** 退出。

房主必须保持网页打开。新建房间会产生新码，旧版 IP 地址式联机码不能使用。请只把联机码发给信任的朋友。房主断开后，客人仍可在当前世界单人游玩并下载存档。

当前实现使用随项目提供的 PeerJS 1.5.5，通过公共 PeerJS 信令服务建立 WebRTC 数据连接，并使用该库默认的 STUN/TURN 配置。无需运行旧的 `server.py`，也无需开放 8081 端口。双方网络仍须能访问这些服务；连接失败或超时会显示提示，可以重试。

目前同步世界初始存档、玩家位置、普通方块编辑和家具放置。生物 AI、车辆、缩小后的微方块编辑及家具操作尚未完整实时同步；重建世界、另载存档或切换维度会退出房间。大于 16,777,216 字符的世界存档暂不传输。联机不是公共服务器管理系统，不提供账号权限或反作弊。

## GitHub Pages 部署
发布完整项目文件，不能只上传 `game3d.html`。在仓库 **Settings > Pages** 中选择 **Deploy from a branch**、**main**、**/(root)**，保存并等待部署完成。

现有游戏入口：[Daniel Game Minecraft](https://vickysy.github.io/MineWorld-3D4/game3d.html)。GitHub Pages 提供静态网页；联机信令和中继由上述外部服务提供，不是在 GitHub 上运行后端服务器。

## 联机回归测试
`node tests/multiplayer.cjs` 使用两个独立的 Playwright 浏览器会话测试真实信令、房间进入、世界同步、方块编辑、退出重连和失败恢复。可通过 `GAME_URL` 指向已部署版本，通过 `PLAYWRIGHT_MODULE` 和 `CHROME_PATH` 指定本机依赖。
