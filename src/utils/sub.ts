import path from "path";
import ora from "ora";
import { createSubRoot } from "taro-plugin-sub-tools";
import { fileTypeMap, readAppJson, resolvePath, MAIN_ROOT, checkHasMainRoot, createOraText, combiningSuffix, moveAndCopy, getAbsoluteByRelativePath, mergeSubRoots, getFileType, getPathAfterMove, modifyStyleImportPath, resolveCachePath } from "utils";

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
            const from = path.resolve(outputPath, `./${page}`);
            const to = path.resolve(outputPath, `./${outputPrefix}/${item}`);
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
 * @param ctx 
 * @param tempFiles 
 * @param subRootMap 
 * @returns 
 */
function collectComponentMapPreset(ctx, tempFiles, subRootMap) {
    // 收集对应的自定义组件信息
    const componentMapPreset = {};
    Object.keys(tempFiles).forEach(sourcePathExt => {
        const { type, config } = tempFiles[sourcePathExt] || {};
        const { usingComponents } = config || {};
        if (!usingComponents || type === 'ENTRY') return;
        const subRoot = subRootMap[sourcePathExt] || MAIN_ROOT;
        const parentAbsolutePath = getAbsoluteByRelativePath(ctx, sourcePathExt, "./");

        Object.keys(usingComponents).forEach(name => {
            const relativePath = usingComponents[name];
            const absolutePath = getAbsoluteByRelativePath(ctx, sourcePathExt, relativePath);
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
                } else {
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
 * @param ctx 
 * @param tempFiles 
 */
export function modifyBuildTempFileContent(ctx, tempFiles) {
    const EntryPath = Object.keys(tempFiles).find(key => tempFiles[key].type === 'ENTRY');
    const { config = {} } = tempFiles[EntryPath] || {};
    if (EntryPath) {
        ctx.appConfig = {
            pages: config.pages,
            subPackages: config.subPackages
        }
    }
    const { subPackages, movePaths: movePagePath, preloadRule, subRootMap } = formatSubPackages(ctx, config.subPackages);
    // 这里仅做收集，编译完成后统一处理
    if (subRootMap) {
        const oraText = createOraText("collect");
        const spinner = ora().start(oraText.start());
        // 收集对应的自定义组件信息
        const componentMapPreset = collectComponentMapPreset(ctx, tempFiles, subRootMap);
        const componentMap = collectComponentMap(componentMapPreset);
        const { componentBackPaths, componentMovePaths } = collectMovePaths(ctx, componentMap);
        ctx.subPackagesMap = {
            subPackages,
            preloadRule,
            subRootMap,    // 子包根页面所属分包集合
            movePaths: [...movePagePath, ...componentMovePaths],
            componentBackPaths,
            componentMap
        };
        spinner.succeed(oraText.succeed());
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
            const move = !checkHasMainRoot(subRoots);
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
async function fixComponentsAndStylePath(ctx, opts) {
    const { from, to, isBack } = opts;
    const { componentMap } = ctx.subPackagesMap || {};
    const { fs: { readJson, writeJson } } = ctx.helper;
    const fileType = getFileType();
    if (isBack) {
        const jsonPathFrom = resolveCachePath(ctx, from, fileType.config);
        if (!jsonPathFrom) return;
    }
    const jsonPathTo = resolvePath(to, fileType.config);
    if (jsonPathTo) {
        const { usingComponents, ...appCon } = await readJson(jsonPathTo, { throws: false }) || {};
        usingComponents && Object.keys(usingComponents).forEach(name => {
            const relativePath = usingComponents[name];
            const {
                absolutePath,
                relativePath: relativePathMoved
            } = getPathAfterMove(ctx, from, to, relativePath);
            const { move = false } = componentMap[absolutePath] || {};
            // 返回主包时不应该修改同步跟随移动过来的包；
            if (isBack ? move : !move) {
                // 说明此组件未移入子包，需要更改引入路径
                usingComponents[name] = relativePathMoved;
            }
        });
        await writeJson(jsonPathTo, {
            ...appCon,
            usingComponents
        });
    }
    await modifyStyleImportPath(ctx, opts);

}

/**
 * 
 * @description 移动页面或组件，编译后的：包含4个文件
 * @param ctx 
 * @param isBack 返回到主包
 * @returns 
 */
async function movePageOrComponent(ctx, movePaths, isBack = false) {
    if (!movePaths || !movePaths.length) {
        return;
    }
    const oraTextMove = createOraText();
    const spinner = ora().start(oraTextMove.start({ isBack }));
    const movePathsWithSuffix = combiningSuffix(movePaths);
    await Promise.all(movePathsWithSuffix.map(item => moveAndCopy(ctx, item, isBack)))
        .then(() => spinner.succeed(oraTextMove.succeed({ isBack })))
        .catch(err => spinner.fail(oraTextMove.fail({ isBack, message: err.message })));

    // 修正组件引用路径
    const oraTextFix = createOraText("fix");
    spinner.start(oraTextFix.start({ isBack }));
    await Promise.all(movePaths.map(([from, to]) => fixComponentsAndStylePath(ctx, { from, to, isBack })))
        .then(() => spinner.succeed(oraTextFix.succeed({ isBack })))
        .catch(err => spinner.fail(oraTextFix.fail({ isBack, message: err.message })));
}

/**
 * 
 * @description 移动分包
 */
export async function mvSubPackages(ctx) {
    const { movePaths, componentBackPaths, subPackages, preloadRule } = ctx.subPackagesMap || {};
    if (subPackages && subPackages.length > 0) {
        const { fs: { writeJson } } = ctx.helper;
        // 移动文件
        await movePageOrComponent(ctx, movePaths);
        await movePageOrComponent(ctx, componentBackPaths, true);
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
 * 
 * @description 更新页面路径
 * @param ctx 
 * @param subPackages 
 */
export async function renamePagesName(ctx) {
    const { outputPath } = ctx.paths;
    const { pages, subPackages } = ctx.appConfig;
    const { fs: { renameSync } } = ctx.helper;
    const fileType = getFileType();
    const list = [...pages];
    subPackages && subPackages.map(({ root, pages }) => {
        list.push(...pages.map(item => `${root}/${item}`));
    });
    list.map(item => {
        Object.keys(fileType).map(key => {
            const suffix = fileType[key];
            const pagePath = path.join(outputPath, item)
            const oldPath = resolvePath(pagePath, suffix);
            const newPath = pagePath + suffix;
            if (oldPath) {
                renameSync(oldPath, newPath)
            }
        });
    });
}