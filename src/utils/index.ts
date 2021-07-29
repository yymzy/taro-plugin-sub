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
  readAppJson(ctx).then(({ subpackages, subPackages: subPackages_ = subpackages, appJsonPath, ...rest }) => {
    const { fs: { writeJson } } = ctx.helper;
    const { TARO_ENV, PLATFORM_ENV = TARO_ENV } = process.env;
    // const { outputPath } = ctx.paths; //moveSync
    const fileType = fileTypeMap[PLATFORM_ENV];
    if (!fileType) return;
    const movePaths = [];
    const subPackages = subPackages_.map(({ root: root_, pages, ...rest }, index) => {
      const root = `${root_}-${index}`;

      // 收集
      pages.map(item => {
        const from = `./${root_}/${item}`;
        const to = `./${root}/${item}`;
        movePaths.push(...Object.keys(fileType).map(k => {
          const suffix = fileType[k]; // 后缀
          return [from + suffix, to + suffix];
        }));
      });

      return {
        root,
        pages,
        ...rest
      }
    });
    writeJson(appJsonPath, {
      ...rest,
      subPackages
    });
  })

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