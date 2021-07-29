import path from "path";
import fs from "fs";
// import mv from "mv";

/**
 * 
 * @description 替换
 * @param obj 
 * @param keyMap 
 */
export function recursiveReplaceObjectKeys(obj, keyMap) {
  Object.keys(obj).forEach(key => {
    if (keyMap[key]) {
      obj[keyMap[key]] = obj[key];
      if (typeof obj[key] === "object") {
        recursiveReplaceObjectKeys(obj[keyMap[key]], keyMap);
      }
      delete obj[key];
    } else if (keyMap[key] === false) {
      delete obj[key];
    } else if (typeof obj[key] === "object") {
      recursiveReplaceObjectKeys(obj[key], keyMap);
    }
  });
}

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
 * @description 组装页面路径
 */
export function formatPagesName(ctx) {
  const { outputPath } = ctx.paths;
  const { TARO_ENV, PLATFORM_ENV = TARO_ENV } = process.env;
  const { fs: { renameSync } } = ctx.helper;
  const fileType = fileTypeMap[PLATFORM_ENV];

  if (!fileType) return;
  readAppJson(ctx).then(({ pages, subpackages, subPackages = subpackages }) => {
    const list = [...pages];
    if (subPackages) {
      subPackages.map(({ root, pages = [] }) => {
        list.push(...pages.map(item => `${root}/${item}`));
      });
    }
    list.map(pagePath => {
      Object.keys(fileType).map(key => {
        try {
          const suffix = fileType[key];
          const oldPath = resolvePath(path.join(outputPath, pagePath), suffix);
          const newPath = path.join(outputPath, pagePath + suffix);
          if (oldPath) {
            renameSync(oldPath, newPath)
          }
        } catch (error) {
          console.log(error.message);
        }
      })
    })
  })
}

/**
 * 
 * @description 移动分包
 */
export function mvSubPackages(ctx) {
  readAppJson(ctx).then(({ subpackages, subPackages: subPackages_ = subpackages, appJsonPath, ...rest }) => {
    const { fs: { writeJson, moveSync } } = ctx.helper;
    const { TARO_ENV, PLATFORM_ENV = TARO_ENV } = process.env;
    const { outputPath } = ctx.paths;
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
 * 
 * @description 处理路径
 * @param p 
 * @param suffix 
 * @returns 
 */
export function resolvePath(p: string, suffix: string): string {
  const platformEnv = process.env.PLATFORM_ENV;
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
 * @description 处理样式表路径
 * @param p 
 * @param helper 
 * @returns 
 */
export function resolveStylePath(p: string, ctx): string {
  const { CSS_EXT } = ctx.helper;
  const removeExtPath = p.replace(path.extname(p), '');
  for (let i = 0, len = CSS_EXT.length; i < len; i++) {
    const item = CSS_EXT[i];
    const path = resolvePath(removeExtPath, item);
    if (path) {
      return path;
    }
  }
  return p
}

/**
 * 
 * @description 处理脚本路径
 * @param name 
 * @param helper 
 * @returns 
 */
export function resolveScriptPath(p: string, ctx): string {
  const { JS_EXT, TS_EXT } = ctx.helper;
  const SCRIPT_EXT = JS_EXT.concat(TS_EXT);
  for (let i = 0, len = SCRIPT_EXT.length; i < len; i++) {
    const item = SCRIPT_EXT[i];
    const path = resolvePath(p, item);
    if (path) {
      return path
    }
  }
  return p;
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