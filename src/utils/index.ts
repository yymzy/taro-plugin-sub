import path from "path";
import fs from "fs";
import chalk from "chalk";

/**
 * 
 * @description 错误
 * @param message 
 * @returns 
 */
export function throwError(message) {
  return new Error(message);
}

/**
 * 
 * @description 更新配置，分包注入chunk
 * @param ctx 
 */
export function updateConfig(ctx) {
  // ctx.initialConfig.mini.addChunkPages = (pages, pagesNames) => {
  // }
}

/**
 * 
 * @description 获取文件后缀
 * @returns 
 */
export function getFileType() {
  const { TARO_ENV, PLATFORM_ENV = TARO_ENV } = process.env;
  return fileTypeMap[PLATFORM_ENV];
}

/**
 *
 * 组合后缀
 * @param paths 
 */
export function combiningSuffix(paths) {
  let fileType = getFileType();
  const files = [];
  if (!fileType || !paths) return files;
  paths.forEach(([from, to]) => {
    Object.keys(fileType).forEach(k => {
      const suffix = fileType[k]; // 后缀
      files.push([from, to, suffix]);
    });
  });
  return files;
}

/**
 * 
 * 复制文件或移除文件
 * @param ctx 
 * @param param1 
 * @returns 
 */
export async function copyAndRemove(ctx, opts, action = "copy") {
  const { fs: { copySync, removeSync } } = ctx.helper;
  const [from, to, suffix] = opts;
  const fromResolved = resolvePath(from, suffix);
  if (!fromResolved) return
  const toResolved = to + suffix;
  switch (action) {
    case "copy":
      await copySync(fromResolved, toResolved);
      break;
    case "remove":
      await removeSync(fromResolved);
      break;

    default:
      break;
  }
}

/**
 * @description 文件类型后缀
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

/**
 * @description 主包
 */
export const MAIN_ROOT = "main";

/**
 * 
 * @description 处理路径
 * @param p
 * @param suffix
 * @returns 
 */
export function resolvePath(p: string, suffix: string): string {
  const platformEnv = process.env.PLATFORM_ENV || process.env.TARO_ENV;
  const modeEnv = process.env.MODE_ENV;
  const types = [platformEnv];
  let realpath = "";
  if (modeEnv) {
    types.unshift(`${platformEnv}.${modeEnv}`, modeEnv);
  }
  for (let i = 0, len = types.length; i < len; i++) {
    const type = types[i];
    if (fs.existsSync(realpath = `${p}.${type}${suffix}`)) {
      return realpath;
    }
    if (fs.existsSync(realpath = `${p}${path.sep}index.${type}${suffix}`)) {
      return realpath;
    }
    const pathReg = /\/index$/;
    if (pathReg.test(p) && fs.existsSync(realpath = `${p.replace(pathReg, `.${type}/index`)}${suffix}`)) {
      return realpath;
    }
  }
  if (fs.existsSync(realpath = `${p}${suffix}`)) {
    return realpath;
  }
  if (fs.existsSync(realpath = `${p}${path.sep}index${suffix}`)) {
    return realpath;
  }
  return ""
}

// /**
//  * 
//  * @description 读取app.json配置项
//  * @param ctx 
//  * @returns 
//  */
export function readAppJson(ctx) {
  const { outputPath } = ctx.paths;
  const { fs: { readJson } } = ctx.helper;
  const appJsonPath = path.resolve(outputPath, "./app.json");
  return readJson(appJsonPath).then(data => ({ appJsonPath, ...data }));
}

/**
 * 
 * @description 检查是否已经包含主包标记
 * @param subRoots 
 * @returns 
 */
export function checkHasMainRoot(subRoots) {
  return subRoots && subRoots.includes(MAIN_ROOT);
}

/**
 * 
 * @description 注入subRoots
 */
export function mergeSubRoots(...arg) {
  const subRoots = [];
  arg.forEach(item => {
    if (!item) return;
    item.forEach(subRoot => {
      if (!subRoots.includes(subRoot)) {
        subRoots.push(subRoot);
      }
    })
  });
  return subRoots.length ? subRoots : null
}

/**
 * 
 * @description 生成ara文本
 * @param status 
 * @param opts 
 */
function getOraText(status, opts?) {
  const statusMap = {
    start: ["开始：", "yellow"],
    succeed: ["完成：", "green"],
    fail: ["失败：", "red"]
  }
  const { type = "move", isBack, message = "" } = opts || {};
  let text = ""
  switch (type) {
    case "move":  // 移动文件
      text = `移动文件${isBack ? "回(主" : "到(分"}包)`
      break;
    case "fix": // 修正组件引用路径
      text = `修正组件与样式引用路径(${isBack ? "主" : "分"}包)`
      break;
    case "collect": // 收集引用关系
      text = "收集引用关系";
      break;
    default:
      break;
  }
  const [prefix, color] = statusMap[status];
  if (message) {
    text = text + `(${message})`;
  }
  chalk.level = 1;
  return chalk[color](prefix) + text + (status !== 'start' ? "\n" : "");
}
export function createOraText(type = "move") {
  return {
    start: (opts?) => getOraText("start", { ...opts, type }),
    succeed: (opts?) => getOraText("succeed", { ...opts, type }),
    fail: (opts?) => getOraText("fail", { ...opts, type }),
  }
}

/**
* 
* @description 获取自定义组件的输出路径
* @param ctx 
* @param sourcePathExt 
* @param comRelativePath 
* @returns 
*/
export function getAbsoluteByRelativePath(ctx, sourcePathExt, comRelativePath = "") {
  const { outputPath, sourcePath, nodeModulesPath } = ctx.paths;
  const { NODE_MODULES_REG } = ctx.helper;
  const pattern = comRelativePath === "./"
    ? /(\.(?<ext>[^.\\\?\/\*\|<>:"]+))$/
    : /\/((?<filename>(?<name>[^\\\?\/\*\|<>:"]+?)\.)?(?<ext>[^.\\\?\/\*\|<>:"]+))$/
  let parentPath = sourcePathExt.replace(pattern, "");
  if (NODE_MODULES_REG.test(sourcePathExt)) {
    parentPath = parentPath.replace(nodeModulesPath, outputPath + "/npm");
  } else {
    parentPath = parentPath.replace(sourcePath, outputPath);
  }
  return path.resolve(parentPath, comRelativePath)
}

/**
 * 
 * @description 获取文件移动后的相对路径
 * @param ctx
 * @param from 
 * @param to 
 * @param relativePath 
 * @returns
 */
export function getPathAfterMove(ctx, from, to, relativePath) {
  const fromAbsolute = getAbsoluteByRelativePath(ctx, from, relativePath);
  const toAbsolute = getAbsoluteByRelativePath(ctx, to);
  return {
    absolutePath: fromAbsolute,
    relativePath: path.relative(toAbsolute, fromAbsolute)
  };
}

/**
 * 
 * @description 移动后的文件修改全局样式的引用 ，主要针对 common.wxss
 * @param ctx 
 * @param param1 
 */
export async function modifyStyleImportPath(ctx, { from, to }) {
  const { cssImports, fs: { readFile, writeFile } } = ctx.helper;
  const fileType = getFileType();
  const stylePath = resolvePath(to, fileType.style);
  if (!stylePath) return;
  const styleData = await readFile(stylePath);
  const importPaths = cssImports(styleData);
  await Promise.all(importPaths.map((item) => {
    const { relativePath } = getPathAfterMove(ctx, from, to, item);
    return writeFile(stylePath, String(styleData).replace(item, relativePath));
  }));
}