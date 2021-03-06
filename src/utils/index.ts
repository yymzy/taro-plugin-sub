import path from "path";
import fs from "fs";
import chalk from "chalk";
import { createSubRoot } from "taro-plugin-sub-tools";

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
  },
  swan: {
    templ: ".swan",
    style: ".css",
    config: ".json",
    script: ".js"
  },
  quick: {
    templ: ".qxml",
    style: ".css",
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
 * @description tempFiles中文件为node_modules，需要切换一下
 * @param tempFiles 
 * @param item 
 * @returns 
 */
export function getTempFilesItem(tempFiles, item) {
  const ctx = ref.current;
  const { nodeModulesPath } = ctx.paths;
  return tempFiles[item.replace(getNpmOutPath(), nodeModulesPath)];
}

/**
 * 
 * @description 处理路径
 * @param p
 * @param suffix
 * @param filesMap 从文件组中查询
 * @param collect 收集所有
 * @returns 
 */
export function resolvePath(p: string, suffix: string, filesMap?): any {
  const platformEnv = process.env.PLATFORM_ENV || process.env.TARO_ENV;
  const modeEnv = process.env.MODE_ENV;
  const types = [platformEnv];
  let realpath = "";
  if (modeEnv) {
    types.unshift(`${platformEnv}.${modeEnv}`, modeEnv);
  }
  // 检查文件是否存在，兼容传入tempFiles的模式
  const checkFileIsExist = (file) => {
    return filesMap ? !!getTempFilesItem(filesMap, file) : fs.existsSync(file);
  }
  for (let i = 0, len = types.length; i < len; i++) {
    const type = types[i];
    if (checkFileIsExist(realpath = `${p}.${type}${suffix}`)) {
      return realpath;
    }
    if (checkFileIsExist(realpath = `${p}${path.sep}index.${type}${suffix}`)) {
      return realpath;
    }
    const pathReg = /\/index$/;
    if (pathReg.test(p) && checkFileIsExist(realpath = `${p.replace(pathReg, `.${type}/index`)}${suffix}`)) {
      return realpath;
    }
  }
  if (checkFileIsExist(realpath = `${p}${suffix}`)) {
    return realpath;
  }
  if (checkFileIsExist(realpath = `${p}${path.sep}index${suffix}`)) {
    return realpath;
  }
  return ""
}

/**
 * 
 * @description 检查是否已经包含主包标记
 * 多个分包引用，则放入主包：subRoots.includes(MAIN_ROOT) || subRoots.length > 1 ；
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
 * @description npm包输出路径 
 * @returns 
 */
function getNpmOutPath() {
  const ctx = ref.current;
  const { sourcePath, } = ctx.paths;
  const { NPM_DIR } = ctx.helper;
  return `${sourcePath}/${NPM_DIR}`
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
    parentPath = parentPath.replace(nodeModulesPath, getNpmOutPath());
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
  const toPath = path.join(sourcePath, subRoot);
  if (from.startsWith(toPath)) {
    return from;
  }
  return from.replace(sourcePath, toPath);
}

export function deleteMovedPaths() {
  const ctx = ref.current;
  const { movePathMap } = ctx.subPackagesMap;
  const { sourcePath, outputPath } = ctx.paths;
  const { fs: { remove } } = ctx.helper
  // 存在则删除
  const fileType = getFileType();
  Object.keys(movePathMap).forEach((from) => {
    Object.keys(fileType).forEach(key => {
      const outputPathExt = resolvePath(removeFileSuffix(from.replace(sourcePath, outputPath)), fileType[key]);
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


/**
 * 
 * @description 收集预下载分包配置，微信支持配置 name
 * @param param0 
 * @param preloadRuleMap 
 */
export function collectPreloadRule({ preloadRule, name, network = "all" }, preloadRuleMap) {
  if (!preloadRule) return
  preloadRuleMap[preloadRule] = preloadRuleMap[preloadRule] || {
    packages: [],
    network
  }
  preloadRuleMap[preloadRule].packages.push(name);
}

/**
* 
* @description 格式化分包
* @returns 
*/
export function formatSubPackages(tempFiles) {
  const ctx = ref.current;
  const { TARO_ENV, PLATFORM_ENV = TARO_ENV } = process.env;
  const { sourcePath } = ctx.paths;
  const { subPackages } = ctx.appConfig;
  const fileType = fileTypeMap[PLATFORM_ENV];
  if (!fileType || !subPackages || subPackages.length === 0) return {};

  const preloadRuleMap = {}; // 预下载配置
  const subRootMap = {}; // 分包配置
  const subPackagesFormatted = subPackages.map(({ preloadRule, network, root: sourceRoot, pages, outputRoot, ...subItem }, index) => {
    // 保证分包只有一级
    const { subRoot, sourcePrefix } = createSubRoot({ outputRoot, sourceRoot }, index);
    // 收集需要移动的分包列表
    const pagesFormatted = pages.map(item => {
      const page = sourcePrefix + item;
      const from = path.resolve(sourcePath, `./${page}`);
      const { sourcePathExt } = getTempFilesExtPath(from, tempFiles);
      if (sourcePathExt) {
        subRootMap[sourcePathExt] = { subRoot, from };
      }
      return page;
    });

    // preloadRule
    let name = subRoot;
    if (PLATFORM_ENV === 'weapp') {
      // 微信可配置name
      name = subItem.name || subRoot;
    } else {
      delete subItem.name;
    }
    const preloadRules = Array.isArray(preloadRule) ? preloadRule : [preloadRule]
    preloadRules.forEach(preloadRule => {
      collectPreloadRule({ preloadRule, name, network }, preloadRuleMap);
    });

    return {
      root: subRoot,
      pages: pagesFormatted,
      ...subItem
    }
  });

  return {
    subRootMap,
    preloadRule: Object.keys(preloadRuleMap).length ? preloadRuleMap : null,
    subPackages: subPackagesFormatted
  }
}

/**
 * 
 * @description 收集 componentMapPreset
 * @param tempFiles 
 * @param subRootMap 
 * @returns 
 */
export function collectComponentMapPreset(tempFiles, subRootMap) {
  // 收集对应的自定义组件信息
  const componentMapPreset = {};
  Object.keys(tempFiles).forEach(item => {
    const { type, config } = tempFiles[item] || {};
    const { usingComponents } = config || {};
    if (!usingComponents || type === 'ENTRY') return;
    const { subRoot = MAIN_ROOT } = subRootMap[item] || {};
    const { sourcePathExt: parentAbsolutePath } = getTempFilesExtPath(getAbsoluteByRelativePath(item, "./"), tempFiles);
    Object.keys(usingComponents).forEach(name => {
      const relativePath = usingComponents[name];
      let { sourcePathExt: absolutePath } = getTempFilesExtPath(getAbsoluteByRelativePath(item, relativePath), tempFiles);
      let currentCom = componentMapPreset[absolutePath];
      const parentCom = componentMapPreset[parentAbsolutePath];
      if (!currentCom) {
        currentCom = componentMapPreset[absolutePath] = {
          parents: []
        }
      }
      if (type === 'PAGE') {
        // 父级为页面组件直接注入subRoots
        currentCom.subRoots = mergeSubRoots(currentCom.subRoots, [subRoot]);
      } else {
        const { subRoots: parentSubRoots } = parentCom || {};
        if (checkHasMainRoot(parentSubRoots)) {
          // 已经包含主包，则判断一定进入主包，不用再做处理
          currentCom.subRoots = mergeSubRoots(currentCom.subRoots, parentSubRoots);
        } else if (parentAbsolutePath && !currentCom.parents.includes(parentAbsolutePath)) {
          // 其他组件push进去等待查询
          currentCom.parents.push(parentAbsolutePath);
        }
      }
    });
  });
  return componentMapPreset;
}

/**
 * 
 * @description 循环查找各组件所属分包
 * @param componentMapPreset
 */
function loopFindSubRoots(componentMapPreset, sourcePathExt, preSubRoots = null) {
  const { subRoots, parents } = componentMapPreset[sourcePathExt] || {}; // 当前subRoots
  const subRootsMerged = mergeSubRoots(preSubRoots, subRoots);  // 合并上一个与当前的subRoots
  const parentsLength = parents ? parents.length : 0;

  if ((checkHasMainRoot(subRootsMerged) || !parentsLength)) {
    return subRootsMerged;
  }

  if (parentsLength) {
    return mergeSubRoots(...parents.map(item => loopFindSubRoots(componentMapPreset, item, subRootsMerged)));
  }

  return null;
}

/**
 * 
 * @description 收集 componentMap
 * @param componentMapPreset 
 * @returns 
 */
export function collectComponentMap(componentMapPreset) {
  const componentMap = {}
  // 收集subRoots
  Object.keys(componentMapPreset).forEach(sourcePathExt => {
    if (!componentMap[sourcePathExt]) {
      componentMap[sourcePathExt] = {};
    }
    const subRoots = loopFindSubRoots(componentMapPreset, sourcePathExt);
    if (subRoots) {
      componentMap[sourcePathExt].subRoots = mergeSubRoots(componentMap[sourcePathExt].subRoots, subRoots);
    }
  });
  return componentMap;
}


/**
 * 
 * @description 移除部分ke
 * @param tempFiles 
 * @param subRootMap 
 * @param keys 
 */
export function deleteSomeKeys(keys, ...dataMap) {
  keys.forEach(key => {
    dataMap.forEach(data => {
      delete data[key];
    });
  });
}

/**
 * 
 * @description 收集移动路径，移出或者回退的路径
 * @param componentMap 
 * @returns 
 */
export function collectMovePathMap({ subRootMap, componentMap }) {
  const movePathMap = {};
  const mergeMap = { ...subRootMap, ...componentMap };
  Object.keys(mergeMap).forEach(key => {
    const item = mergeMap[key];
    const { subRoot = MAIN_ROOT, subRoots = [subRoot] } = item;
    const move = !checkHasMainRoot(subRoots);
    if (move) {
      movePathMap[key] = subRoots
    }
  });

  return { movePathMap }
}

/**
 * 
 * @description 获取源码真实路径
 * @param from 
 * @param tempFiles 
 * @returns 
 */
export function getTempFilesExtPath(from, tempFiles) {
  const ctx = ref.current;
  const { JS_EXT, TS_EXT } = ctx.helper;
  const list = [...JS_EXT, ...TS_EXT];
  let sourcePathExt = "";
  let suffix = ""
  for (let i = 0, len = list.length; i < len; i++) {
    suffix = list[i];
    sourcePathExt = resolvePath(from, suffix, tempFiles)
    if (sourcePathExt) {
      break;
    }
  }
  return { sourcePathExt, suffix };
}

/**
 * 
 * @description 获取资源路径
 * @param from 
 * @param assets 
 */
export function getAssetsExtPaths(from, assets) {
  const fileType = getFileType();
  return Object.keys(fileType).map((key) => {
    const suffix = fileType[key];
    const assetsPathExt = resolvePath(from, suffix, assets);
    return assetsPathExt ? [assetsPathExt, suffix] : null
  }).filter(item => item);
}

/**
 * 
 * @description 循环遍历 movePathMap
 * @param callback 
 */
export function loopTraversalMovePathMap(callback) {
  const ctx = ref.current;
  const { movePathMap } = ctx.subPackagesMap;
  if (!movePathMap) return;
  Object.keys(movePathMap).forEach(from => {
    const subRoots = movePathMap[from];
    subRoots.forEach(subRoot => {
      const to = getComponentMovePath(from, subRoot);
      callback({ from, to });
    });
  });
}


/**
 * 
 * @description 根据 tempFilesPath 获取 编译文件列表（fileType所有后缀组合）
 * @param tempFilesPath 
 */
export function getAssetsPathByTempFilesPath(from, assets) {
  return getAssetsExtPaths(getPureAssetsPath(from), assets);
};

/**
 * 
 * @description 获取纯路径
 * @param path 
 * @returns 
 */
export function getPureAssetsPath(path) {
  const ctx = ref.current;
  const { sourcePath } = ctx.paths;
  return removeFileSuffix(path).replace(sourcePath + "/", "")
}