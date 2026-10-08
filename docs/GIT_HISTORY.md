# Git 历史来源与保留方式

本仓库记录真实发生的导入、开发和验证工作，不为了满足比赛展示而编造提交次数或补写历史日期。

## 已有历史

1. `m012583/course-companion` 在本次更新前的主分支为 `47501ec0f4a04219ee37f5976a2fa3cf79453464`，有 12 条提交。这些原始提交的对象、作者、日期及父子关系全部保留。
2. 用户提供的“课伴研学增强版”目录没有 `.git`，不能从源码文件恢复未知的旧开发记录。本次实际检查后创建了源码导入基线 `b6d671c`，提交发生在 2026-10-08；它只表示该次导入，不冒充之前的开发过程。
3. 合并保留上述两条来源记录，以提供的增强版内容作为新的代码基线，再提交实际完成的 0.3 更新及仓库说明。

未知的原开发历史不会被伪造。如果日后取得原始 Git 仓库或 bundle，应先验证来源，再通过正常合并保留其真实记录。

## 操作原则

- 已公开历史不使用 `reset --hard` 配合强推覆盖；不修改旧提交时间或作者。
- 本次没有压缩提交、浅克隆或重建旧历史。
- 功能和说明按实际完成的内容提交；失败尝试不是虚构成功记录。
- 源码 ZIP 方便运行，但不包含完整 Git 对象。评审历史应使用 GitHub 仓库、完整克隆或随交付保留的 Git bundle。

## 验证命令

```bash
git log --graph --oneline --decorate --all
git rev-list --count HEAD
git merge-base --is-ancestor 47501ec0f4a04219ee37f5976a2fa3cf79453464 HEAD
git merge-base --is-ancestor b6d671c HEAD
git fsck --full
```

两个祖先检查都应退出码为 0。`git fsck` 验证对象完整性，但不证明未知的早期开发记录存在。

完整离线备份：

```bash
git bundle create course-companion-history.bundle --all
git bundle verify course-companion-history.bundle
git clone course-companion-history.bundle course-companion-restored
```

GitHub 为 Public 时评审可直接查看；若将来改为私有，应另行提供评审访问权限。

## 0.4 更新

从 `d0e2e53` 建立更新分支，先提交实际完成的学习流程与阅读界面，再提交依赖修复、评测和交付文档。旧的 17 条可达提交均作为祖先保留；不回填日期、不重写作者、不强推覆盖历史。


## 0.5 更新

从 `79a76e0` 建立 `update/0.5-learning-experience` 分支，完成查找、复习队列、阅读布局、本机 AI 配置、复述核对和笔记历史。旧的 21 条真实提交继续保留。更新前保存完整 Git bundle 和学习数据备份；通过验证后按实际完成内容提交并快进发布，不改写旧提交。
