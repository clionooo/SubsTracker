# 飞牛 fnOS fpk 打包指南

## 方式一：Docker 部署（推荐，最简单）

飞牛 fnOS 自带 Docker（应用中心 → Docker），直接导入即可：

1. 把整个 `SubsTracker` 目录上传到 NAS（如 `/vol1/1000/docker/substracker`）
2. fnOS 的 Docker 界面 → Compose → 新建项目，选择该目录（读取 `docker-compose.yml`）启动
3. 访问 `http://NAS的IP:3000`，默认账号 `admin` / `password`

## 方式二：打包为 fpk 应用（可在 fnOS 桌面显示图标）

fpk 打包需要在 Linux 环境（fnOS 的 SSH 终端也可以）使用飞牛官方 `fnpack` CLI。

### 步骤

```bash
# 1. 上传整个 SubsTracker 仓库到 NAS，SSH 进入目录
cd /vol1/1000/docker/substracker

# 2. 安装 fnpack（下载地址见官方文档）
#    https://developer.fnnas.com/docs/cli/fnpack

# 3. 一键打包
bash fpk/build-fpk.sh
# 生成 fpk-template/substracker.fpk

# 4. fnOS 应用中心 → 右上角"手动安装" → 选择 substracker.fpk
```

### fpk 包说明

- 安装后自动在 fnOS 桌面生成「SubsTracker」图标，点击打开 Web 界面
- 服务端口：`36789`（可在 `fpk-template/manifest` 的 `service_port` 与 `fpk-template/app/ui/config` 的 `port` 中同步修改）
- 数据保存在应用数据目录（`TRIM_PKGVAR`），卸载应用不删除数据
- 安装向导中可设置每日提醒时间（cron）
- **运行时**：优先使用系统 Node.js；若没有 Node，会自动使用 fnOS 应用中心的 **Bun（bunjs）** 运行，两者都不存在时启动会给出提示

### 目录结构（fpk-template）

```
fpk-template/
├── manifest              # 应用元信息（appname/版本/端口/桌面入口）
├── ICON.PNG / ICON_256.PNG
├── config/
│   ├── privilege         # 以 package 用户运行
│   └── resource          # 声明共享数据目录
├── wizard/install        # 安装向导（提醒时间 cron 设置）
├── cmd/                  # 生命周期脚本（启动/停止/状态检查）
└── app/                  # 应用本体（打包脚本自动同步）
    ├── index.js / package.json / src/ / public/
    └── ui/config         # fnOS 桌面图标入口
```
