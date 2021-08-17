import path from "path";
import ora from "ora";
import { createSubRoot } from "taro-plugin-sub-tools";
import { fileTypeMap, resolvePath, MAIN_ROOT, checkHasMainRoot, createOraText, getAbsoluteByRelativePath, mergeSubRoots, getComponentMovePath, deleteMovedPaths, ref, removeFileSuffix, getRelativeByAbsolutePath } from "utils";

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
 * @returns 
 */
function formatSubPackages() {
    const ctx = ref.current;
    const { TARO_ENV, PLATFORM_ENV = TARO_ENV } = process.env;
    const { sourcePath } = ctx.paths;
    const { subPackages } = ctx.appConfig;
    const { JS_EXT, TS_EXT } = ctx.helper;
    const fileType = fileTypeMap[PLATFORM_ENV];
    if (!fileType || !subPackages || subPackages.length === 0) return {};

    const movePaths = []; // 分包列表
    const preloadRuleMap = {}; // 预下载配置
    const subRootMap = {}; // 分包配置
    const subPackagesFormatted = subPackages.map(({ preloadRule, network, root: sourceRoot, pages, outputRoot, ...subItem }, index) => {
        // 保证分包只有一级
        const { subRoot, outputPrefix, sourcePrefix } = createSubRoot({ outputRoot, sourceRoot }, index);
        // 收集需要移动的分包列表
        const pagesFormatted = pages.map(item => {
            const page = sourcePrefix + item;
            const from = path.resolve(sourcePath, `./${page}`);
            const to = path.resolve(sourcePath, `./${outputPrefix}/${item}`);
            movePaths.push([from, to]);
            const [sourcePathExt] = [...JS_EXT, ...TS_EXT].map(suffix => resolvePath(from, suffix)).filter(item => item);
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
 * @description 循环查找各组件所属分包
 * @param componentMapPreset
 */
function loopFindSubRoots(componentMapPreset, sourcePathExt, preSubRoots = null) {
    const { subRoots, parents } = componentMapPreset[sourcePathExt] || {}; // 当前subRoots
    const subRootsMerged = mergeSubRoots(preSubRoots, subRoots);  // 合并上一个与当前的subRoots
    const parentsLength = parents ? parents.length : 0;
    const subRootsLength = subRoots ? subRoots.length : 0;
    if (subRootsLength && (checkHasMainRoot(subRootsMerged) || !parentsLength)) {
        return subRootsMerged;
    }
    if (parentsLength) {
        for (let i = 0; i < parentsLength; i++) {
            return loopFindSubRoots(componentMapPreset, parents[i], subRootsMerged);
        }
    }
    return subRootsMerged;
}

/**
 * 
 * @description 收集 componentMapPreset
 * @param tempFiles 
 * @param subRootMap 
 * @returns 
 */
function collectComponentMapPreset(tempFiles, subRootMap) {
    // 收集对应的自定义组件信息
    const componentMapPreset = {};
    const ctx = ref.current;
    const { movePaths } = ctx.subPackagesMap || {};
    Object.keys(tempFiles).forEach(sourcePathExt => {
        const { type, config } = tempFiles[sourcePathExt] || {};
        const { usingComponents } = config || {};
        if (!usingComponents || type === 'ENTRY') return;
        const subRoot = subRootMap[sourcePathExt] || MAIN_ROOT;
        const parentAbsolutePath = getAbsoluteByRelativePath(sourcePathExt, "./");

        Object.keys(usingComponents).forEach(name => {
            const relativePath = usingComponents[name];
            let absolutePath = getAbsoluteByRelativePath(sourcePathExt, relativePath);
            let currentCom = componentMapPreset[absolutePath];
            if (movePaths) {
                const [currentFrom] = movePaths.find(([from]) => from === absolutePath) || [];
                if (currentFrom) return;
            }
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
                } else {
                    // 其他组件push进去等待查询
                    currentCom.parents.push(parentAbsolutePath);
                }
            }
        });
    });
    console.log("componentMapPreset", componentMapPreset);
    return componentMapPreset;
}

/**
 * 
 * @description 收集 componentMap
 * @param componentMapPreset 
 * @returns 
 */
function collectComponentMap(componentMapPreset) {
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
 * @description 单独引入到分包内的自定义组件，保证此组件没有被其他分包或者页面引用，否则放入公共包
 * @param tempFiles 
 */
export function modifyBuildTempFileContent(tempFiles) {
    const ctx = ref.current;
    const EntryPath = Object.keys(tempFiles).find(key => tempFiles[key].type === 'ENTRY');
    const { config = {} } = tempFiles[EntryPath] || {};
    if (EntryPath && !ctx.appConfig) {
        ctx.appConfig = {
            pages: config.pages,
            subPackages: config.subPackages
        }
        const { subPackages, preloadRule, movePaths: pageMovePaths, subRootMap } = formatSubPackages();
        config.subPackages = subPackages;
        config.preloadRule = preloadRule;
        ctx.subPackagesMap = {
            subPackages,
            preloadRule,
            pageMovePaths,
            subRootMap // 子包根页面所属分包集合
        }
    }
    const { pageMovePaths, subRootMap } = ctx.subPackagesMap || {};
    // 这里仅做收集，编译完成后统一处理
    if (subRootMap) {
        const oraText = createOraText("collect");
        const spinner = ora().start(oraText.start());
        // 收集对应的自定义组件信息
        const componentMapPreset = collectComponentMapPreset(tempFiles, subRootMap);
        const componentMap = collectComponentMap(componentMapPreset);
        const { componentBackPaths, componentMovePaths } = collectMovePaths(componentMap);
        ctx.subPackagesMap = {
            ...ctx.subPackagesMap,
            movePaths: [...pageMovePaths, ...componentMovePaths],
            componentBackPaths,
            componentMap
        };
        spinner.succeed(oraText.succeed());
        // 修正组件引用路径
        fixComponentsAndStylePath(tempFiles);
    }
}

/**
 * 
 * @description 修改编译资源
 * @param assets 
 */
export function modifyBuildAssets(assets) {
    const ctx = ref.current;
    const { sourcePath } = ctx.paths;
    const { movePaths: componentMovePaths = [], componentBackPaths = [] } = ctx.subPackagesMap || {};
    const movePaths = [...componentMovePaths, ...componentBackPaths];
    if (!movePaths.length) return;
    // 加上后缀
    const movePathsPure = movePaths.map(item => item.map(item => item.replace(sourcePath + "/", "") + "."));
    Object.keys(assets).map(item => {
        const [from, to] = movePathsPure.find(([from]) => item.startsWith(from)) || [];
        if (from) {
            assets[item.replace(from, to)] = assets[item];
            delete assets[item];
        }
    });

    // 删除移动的文件
    deleteMovedPaths(movePaths);
}

/**
 * 
 * @description 收集移动路径，移出或者回退的路径
 * @param componentMap 
 * @returns 
 */
function collectMovePaths(componentMap) {
    // 需要移回的自定义组件 
    const componentBackPaths = [];
    // 将自定义组件移入移动的列表
    const componentMovePaths = [];
    Object
        .keys(componentMap).forEach(key => {
            const { subRoots } = componentMap[key];
            if (!subRoots || subRoots.length === 0) return;
            const move = !checkHasMainRoot(subRoots);
            componentMap[key].move = move;
            // 可支持注入多个分包
            const paths = subRoots
                .filter(item => item !== MAIN_ROOT)
                .map(item => ([key, getComponentMovePath(key, item)]));
            move
                ? componentMovePaths.push(...paths)
                : componentBackPaths.push(...paths.map(item => ([...item].reverse())));
        });

    return {
        componentMovePaths,
        componentBackPaths
    }
}

function deleteTempFilesAndSubRootMap(tempFiles, subRootMap, keys) {
    keys.forEach(key => {
        delete tempFiles[key];
        delete subRootMap[key];
    });
}

/**
 * 
 * @description 移入主包后修正引用的组件路径
 */
function fixComponentsAndStylePath(tempFiles) {
    const ctx = ref.current;
    const { movePaths: componentMovePaths, componentBackPaths, subRootMap } = ctx.subPackagesMap;
    const movePaths = [...componentMovePaths, ...componentBackPaths];
    const deleteKeys = [];
    console.log("componentMovePaths", componentMovePaths);
    console.log("componentBackPaths", componentBackPaths)
    Object.keys(tempFiles).forEach(item => {
        const itemInfo = tempFiles[item];
        const [from, to] = movePaths.find(([from]) => item.startsWith(from + ".")) || [];
        if (from) {
            const key = item.replace(from, to)
            tempFiles[key] = itemInfo;
            if (subRootMap[item]) {
                subRootMap[key] = subRootMap[item];
            }
            deleteKeys.push(item);
        }
        // 修正自定义组件引用相对路径
        const { usingComponents } = itemInfo.config || {};
        usingComponents && Object.keys(usingComponents).forEach(name => {
            const relativePath = usingComponents[name]; // 相对路径 ../../components/sub/index.wkd;
            const parentFrom = removeFileSuffix(item);
            const absolutePath = getAbsoluteByRelativePath(parentFrom, relativePath); // 绝对路径
            const parentTo = to || parentFrom;  // 父组件移动后的绝对路径
            const [, currentTo = absolutePath] = movePaths.find(([from]) => from === absolutePath) || []; // 当前组件移入路径
            const relativePathFixed = getRelativeByAbsolutePath(getAbsoluteByRelativePath(parentTo), currentTo);
            usingComponents[name] = relativePathFixed;
        });
    });
    deleteTempFilesAndSubRootMap(tempFiles, subRootMap, deleteKeys);
}