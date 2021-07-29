import path from "path";

/**
 * 
 * @description 读取app.json配置项
 * @param ctx 
 * @returns 
 */
function readAppJson(ctx) {
  const { outputPath } = ctx.paths;
  const { fs: { readJson } } = ctx.helper;
  const appJsonPath = path.resolve(outputPath, "./app.json");
  return readJson(appJsonPath).then(data => ({ appJsonPath, ...data }));
}

/**
 * 
 * @description 移动分包
 */
export function mvSubPackages(ctx) {
  readAppJson(ctx).then(({ subPackages, appJsonPath, ...appCon }) => {
    const { fs: { writeJson, moveSync, existsSync } } = ctx.helper;
    const { TARO_ENV, PLATFORM_ENV = TARO_ENV } = process.env;
    const { outputPath } = ctx.paths;
    const fileType = fileTypeMap[PLATFORM_ENV];
    if (!fileType) return;
    const movePaths = [];
    const subPackagesFormatted = subPackages.map(({ root: sourceRoot, pages, outputRoot = "auto", ...subItem }, index) => {
      const subRoot = outputRoot === 'auto' ? `${sourceRoot}-${index}` : outputRoot;
      // 收集需要移动的文件列表
      pages.map(item => {
        const from = path.resolve(outputPath, `./${sourceRoot}/${item}`);
        const to = path.resolve(outputPath, `./${subRoot}/${item}`);
        movePaths.push(...Object.keys(fileType).map(k => {
          const suffix = fileType[k]; // 后缀
          return [from + suffix, to + suffix];
        }));
      });
      return {
        root: subRoot,
        pages,
        ...subItem
      }
    });

    // 更改subPackages配置
    writeJson(appJsonPath, {
      ...appCon,
      subPackages: subPackagesFormatted
    });

    // 移动分包到置顶目录
    movePaths.map(([from, to]) => {
      if (existsSync(from)) {
        moveSync(from, to, { overwrite: true });
      }
    });

  });

}

/**
 * 文件类型后缀
 */
export const fileTypeMap = {
  weapp: {
    templ: ".wxml",
    style: ".wxss",
    config: ".json",
    script: ".js"
  },
  alipay: {
    templ: ".axml",
    style: ".acss",
    config: ".json",
    script: ".js"
  }
}