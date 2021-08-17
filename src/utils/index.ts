import path from "path";
import fs from "fs";
import chalk from "chalk";

export const ref = { current: null }

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
 * @description
 * MAIN_ROOT 主包
 * CACHE_ROOT 缓存根路径
 */
export const MAIN_ROOT = "main";
export const SUFFIX_REG = /(\.(?<ext>[^.\\\?\/\*\|<>:"]+))$/;
export const FILE_NAME_REG = /\/((?<filename>(?<name>[^\\\?\/\*\|<>:"]+?)\.)?(?<ext>[^.\\\?\/\*\|<>:"]+))$/;

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
 */
export function updateConfig() {
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

/**
 * 
 * @description 检查是否已经包含主包标记
 * 两种方案：
 * 1、多个分包引用，则放入主包：subRootsLength > 1 || subRoots.includes(MAIN_ROOT)；
 * 2、放入各个分包：subRoots.includes(MAIN_ROOT)；
 * @param subRoots 
 * @returns 
 */
export function checkHasMainRoot(subRoots) {
  return subRoots && (subRoots.includes(MAIN_ROOT) || subRoots.length > 1);
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
* @param sourcePathExt 
* @param comRelativePath 
* @returns 
*/
export function getAbsoluteByRelativePath(sourcePathExt, comRelativePath = "") {
  const ctx = ref.current;
  const { nodeModulesPath } = ctx.paths;
  const { NODE_MODULES_REG } = ctx.helper;
  const pattern = comRelativePath === "./" ? SUFFIX_REG : FILE_NAME_REG;
  let parentPath = sourcePathExt.replace(pattern, "");
  if (NODE_MODULES_REG.test(sourcePathExt)) {
    parentPath = parentPath.replace(nodeModulesPath, "/npm");
  }
  return path.resolve(parentPath, comRelativePath)
}

/**
 * 
 * @description 获取文件移动后的相对路径
 * @param from 
 * @param to 
 * @param relativePath 
 * @returns
 */
export function getPathAfterMove(from, to, relativePath) {
  const fromAbsolute = getAbsoluteByRelativePath(from, relativePath);
  const toAbsolute = getAbsoluteByRelativePath(to);
  return {
    absolutePath: fromAbsolute,
    relativePath: path.relative(toAbsolute, fromAbsolute)
  };
}

export function getRelativeByAbsolutePath(to, absolutePath) {
  return path.relative(to, absolutePath);
}

/**
 * 
 * @description 移动后的文件修改全局样式的引用 ，主要针对 common.wxss
 * @param param1 
 */
export async function modifyStyleImportPath({ from, to }) {
  const ctx = ref.current;
  const { cssImports, fs: { readFile, writeFile } } = ctx.helper;
  const fileType = getFileType();
  const stylePath = resolvePath(to, fileType.style);
  if (!stylePath) return;
  const styleData = await readFile(stylePath);
  const importPaths = cssImports(styleData);
  await Promise.all(importPaths.map((item) => {
    const { relativePath } = getPathAfterMove(from, to, item);
    return writeFile(stylePath, String(styleData).replace(item, relativePath));
  }));
}

/**
 * 
 * @description 获取组件移动路径
 * @param from 
 * @param subRoot 
 * @returns 
 */
export function getComponentMovePath(from, subRoot) {
  const ctx = ref.current;
  const { sourcePath } = ctx.paths;
  return from.replace(sourcePath, path.join(sourcePath, subRoot));
}

// function getOutputPath(path) {
//   const { outputPath, sourcePath } = ctx.paths;
//   return path.replace(sourcePath, outputPath)
// }

export function deleteMovedPaths(movePaths) {
  const ctx = ref.current;
  const { sourcePath, outputPath } = ctx.paths;
  const { fs: { remove } } = ctx.helper
  // 存在则删除
  const fileType = getFileType();
  movePaths.forEach(([from]) => {
    Object.keys(fileType).forEach(key => {
      const outputPathExt = resolvePath(from.replace(sourcePath, outputPath), fileType[key]);
      if (outputPathExt) {
        remove(outputPathExt);
      }
    });
  });
}


/**
 * 
 * @description 移除文件后缀
 * @param file 
 * @returns 
 */
export function removeFileSuffix(filePath) {
  return filePath.replace(SUFFIX_REG, "");
}
