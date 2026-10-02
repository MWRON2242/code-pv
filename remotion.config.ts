import { Config } from '@remotion/cli/config';

// 渲染成片时覆盖已有文件，不弹确认
Config.setOverwriteOutput(true);

// 中间帧用 jpeg，渲染更快（无损母版可以在命令行另加 --image-format=png）
Config.setVideoImageFormat('jpeg');
