import path from "path";
import fs from "fs";
import { createSubRoot } from "taro-plugin-sub-tools";

const MAIN_ROOT = "main"; // 主包
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
 * @description 收集预下载分包配置，微信支持配置 name
 * @param param0 
 * @param preloadRuleMap 
 */
function collectPreloadRule({ preloadRule, name, network = "all" }, preloadRuleMap) {
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
 * @param ctx 
 * @param subPackages 
 * @returns 
 */
function formatSubPackages(ctx, subPackages) {
  const { TARO_ENV, PLATFORM_ENV = TARO_ENV } = process.env;
  const { outputPath, sourcePath } = ctx.paths;
  const { JS_EXT, TS_EXT } = ctx.helper;
  const fileType = fileTypeMap[PLATFORM_ENV];
  if (!fileType || !subPackages) return {};

  const movePaths = []; // 分包列表
  const preloadRuleMap = {}; // 预下载配置
  const subRootMap = {}; // 分包配置
  const subPackagesFormatted = subPackages.map(({ preloadRule, network, root: sourceRoot, pages, outputRoot, ...subItem }, index) => {
    // 保证分包只有一级
    const subRoot = createSubRoot({ outputRoot, sourceRoot }, index);
    // 收集需要移动的分包列表
    const pagesFormatted = pages.map(item => {
      const page = `${sourceRoot}/${item}`;
      const from = path.resolve(outputPath, `./${page}`);
      const to = path.resolve(outputPath, `./${subRoot}/${page}`);
      movePaths.push([from, to]);
      const [sourcePathExt] = [...JS_EXT, ...TS_EXT].map(suffix => resolvePath(from.replace(outputPath, sourcePath), suffix)).filter(item => item);
      if (sourcePathExt) {
        subRootMap[sourcePathExt] = subRoot;
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
    collectPreloadRule({ preloadRule, name, network }, preloadRuleMap);

    return {
      root: subRoot,
      pages: pagesFormatted,
      ...subItem
    }
  });

  return {
    subRootMap,
    movePaths,
    preloadRule: preloadRuleMap,
    subPackages: subPackagesFormatted
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
function getComponentOutputPath(ctx, sourcePathExt, comRelativePath) {
  const { outputPath, sourcePath, nodeModulesPath } = ctx.paths;
  let parentPath = sourcePathExt.replace(comRelativePath === "./" ? /(\.\w+)+$/ : /\/\w+((\.\w+)+)?$/, "");
  if (/\/node_modules\//.test(sourcePathExt)) {
    parentPath = parentPath.replace(nodeModulesPath, outputPath + "/npm");
  } else {
    parentPath = parentPath.replace(sourcePath, outputPath);
  }
  return path.resolve(parentPath, comRelativePath)
}

/**
 * 
 * @description 循环查找各组件所属分包
 * @param componentMapPreset
 */
function loopFindSubRoots(componentMapPreset, sourcePathExt) {
  const { subRoots, parents } = componentMapPreset[sourcePathExt];
  const subRootsLength = subRoots ? subRoots.length : 0;
  if (subRootsLength && (subRoots.includes(MAIN_ROOT))) {
    // 1、多个分包引用，则放入主包：subRootsLength > 1 || subRoots[0] === mainRoot；
    // 2、放入各个分包：subRoots.includes(MAIN_ROOT)； 
    return subRoots;
  }
  if (parents && parents.length > 0) {
    for (let i, len = parents.length; i < len; i++) {
      return loopFindSubRoots(componentMapPreset, parents[i])
    }
  }
  return null;
}

/**
 * 
 * @description 注入subRoots
 */
function mergeSubRoots(...arg) {
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
 * @description 单独引入到分包内的自定义组件，保证此组件没有被其他分包或者页面引用，否则放入公共包
 * @param ctx 
 * @param tempFiles 
 */
export function modifyBuildTempFileContent(ctx, tempFiles) {
  const EntryPath = Object.keys(tempFiles).find(key => tempFiles[key].type === 'ENTRY');
  const { config } = tempFiles[EntryPath];
  const { subPackages, movePaths: movePagePath, preloadRule, subRootMap } = formatSubPackages(ctx, config.subPackages);
  // 这里仅做收集，编译完成后统一处理
  ctx.subPackagesMap = {
    subPackages,
    preloadRule,
    subRootMap,    // 子包根页面所属分包集合
    componentMap: {}   // // 自定义组件所属分包集合
  };
  if (subRootMap) {
    // 收集对应的自定义组件信息
    const { componentMap } = ctx.subPackagesMap;
    const componentMapPreset = {};
    Object.keys(tempFiles).forEach(sourcePathExt => {
      const { type, config } = tempFiles[sourcePathExt] || {};
      const { usingComponents } = config || {};
      if (!usingComponents || type === 'ENTRY') return;
      const subRoot = subRootMap[sourcePathExt] || MAIN_ROOT;
      const parentAbsolutePath = getComponentOutputPath(ctx, sourcePathExt, "./");

      Object.keys(usingComponents).forEach(name => {
        const relativePath = usingComponents[name];
        const absolutePath = getComponentOutputPath(ctx, sourcePathExt, relativePath);
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
          if (parentSubRoots) {
            currentCom.subRoots = mergeSubRoots(currentCom.subRoots, parentSubRoots);
          } else {
            // 其他组件push进去等待查询
            currentCom.parents.push(parentAbsolutePath);
          }
        }
      });
    });

    // 收集subRoots
    Object.keys(componentMapPreset).forEach(sourcePathExt => {
      if (!componentMap[sourcePathExt]) {
        componentMap[sourcePathExt] = {}
      }
      const subRoots = loopFindSubRoots(componentMapPreset, sourcePathExt);
      if (subRoots) {
        componentMap[sourcePathExt].subRoots = mergeSubRoots(componentMap[sourcePathExt].subRoots, subRoots)
      }
    });

    const { componentBackPaths, componentMovePaths } = collectMovePaths(ctx, componentMap);

    ctx.subPackagesMap.movePaths = [...movePagePath, ...componentMovePaths];
    ctx.subPackagesMap.backComponentPaths = componentBackPaths;
  }
}

function getComponentMovePath(ctx, from, subRoot) {
  const { outputPath } = ctx.paths;
  return from.replace(outputPath, path.join(outputPath, subRoot));
}

/**
 * 
 * @description 收集移动路径，移出或者回退的路径
 * @param ctx
 * @param componentMap 
 * @returns 
 */
function collectMovePaths(ctx, componentMap) {
  // 需要移回的自定义组件 
  const componentBackPaths = [];
  // 将自定义组件移入移动的列表
  const componentMovePaths = [];
  Object
    .keys(componentMap).forEach(key => {
      const { subRoots } = componentMap[key];
      if (!subRoots || subRoots.length === 0) return;
      const move = !subRoots.includes(MAIN_ROOT);
      componentMap[key].move = move;
      // 可支持注入多个分包
      const paths = subRoots
        .filter(item => item !== MAIN_ROOT)
        .map(item => ([key, getComponentMovePath(ctx, key, item)]));
      move
        ? componentMovePaths.push(...paths)
        : componentBackPaths.push(...paths.map(item => ([...item].reverse())));
    });

  return {
    componentMovePaths,
    componentBackPaths
  }
}

/**
 * 
 * @description 移入主包后修正引用的组件路径
 */
function fixUsingComponentsPath(ctx, from, to) {
  const { componentMap } = ctx.subPackagesMap || {};
  const { fs: { readJsonSync, writeFileSync } } = ctx.helper;
  const jsonPath = resolvePath(to, ".json");
  const { usingComponents, ...appCon } = readJsonSync(jsonPath, { throws: false }) || {};
  if (!usingComponents) return;
  Object.keys(usingComponents).forEach(name => {
    // 移入子包后会增加一级
    const relativePath = usingComponents[name];
    const absolutePath = getComponentOutputPath(ctx, from, relativePath);
    const { move = false } = componentMap[absolutePath] || {};
    if (!move) {
      // 说明此组件未移入子包，需要更改引入路径
      usingComponents[name] = path.relative(to, absolutePath);
    }
  });
  writeFileSync(jsonPath, JSON.stringify({
    ...appCon,
    usingComponents
  }));
}

/**
 * 
 * @description 移动页面或组件，编译后的：包含4个文件
 * @param ctx 
 * @param isBack 返回到主包
 * @returns 
 */
function movePageOrComponent(ctx, movePaths, isBack = false) {
  const { fs: { moveSync, removeSync } } = ctx.helper;
  const { TARO_ENV, PLATFORM_ENV = TARO_ENV } = process.env;
  let fileType = fileTypeMap[PLATFORM_ENV];
  if (!fileType || !movePaths) return;
  movePaths.forEach(([from, to]) => {
    Object.keys(fileType).forEach(k => {
      const suffix = fileType[k]; // 后缀
      const formRealUrl = resolvePath(from, suffix);
      if (formRealUrl) {
        if (isBack && k === 'config') {
          // 回退不需要.json
          removeSync(formRealUrl);
          return;
        }
        moveSync(formRealUrl, to + suffix, { overwrite: true });
      }
    });
    // 回退会重新生成json文件不需要修正
    !isBack && fixUsingComponentsPath(ctx, from, to);
  });
}

/**
 * 
 * @description 移动分包
 */
export function mvSubPackages(ctx) {
  const { movePaths, backComponentPaths, subPackages, preloadRule } = ctx.subPackagesMap || {};
  const { fs: { writeJson } } = ctx.helper;
  movePageOrComponent(ctx, movePaths);
  movePageOrComponent(ctx, backComponentPaths, true);
  if (subPackages) {
    // 更改subPackages配置，及预加载配置
    readAppJson(ctx).then(({ appJsonPath, ...appCon }) => {
      writeJson(appJsonPath, {
        ...appCon,
        preloadRule,
        subPackages
      });
    });
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
function readAppJson(ctx) {
  const { outputPath } = ctx.paths;
  const { fs: { readJson } } = ctx.helper;
  const appJsonPath = path.resolve(outputPath, "./app.json");
  return readJson(appJsonPath).then(data => ({ appJsonPath, ...data }));
}