import ora from "ora";
import {
    collectComponentMapPreset, collectMovePathMap, collectComponentMap, createOraText,
    deleteSomeKeys, deleteMovedPaths,
    formatSubPackages,
    getAssetsPathByTempFilesPath, getPureAssetsPath,
    loopTraversalMovePathMap,
    ref,
    getPathAfterMove,
    getTempFilesExtPath,
} from "utils";

/**
 * 
 * @description 单独引入到分包内的自定义组件，保证此组件没有被其他分包或者页面引用，否则放入公共包
 * @param tempFiles 
 */
export function modifyBuildTempFileContent(tempFiles) {
    const ctx = ref.current;
    const EntryPath = Object.keys(tempFiles).find(key => tempFiles[key].type === 'ENTRY');
    if (!EntryPath) return
    const { config = {} } = tempFiles[EntryPath] || {};
    if (!ctx.appConfig) {
        ctx.appConfig = {
            pages: config.pages,
            subPackages: config.subPackages
        }
        const { subPackages, preloadRule, subRootMap } = formatSubPackages(tempFiles);
        if (!subPackages) return;
        if (preloadRule) {
            config.preloadRule = preloadRule;
        }
        config.subPackages = subPackages;
        ctx.subPackagesMap = {
            subPackages,
            preloadRule,
            subRootMap // 子包根页面所属分包集合
        }
    }
    const { subRootMap } = ctx.subPackagesMap || {};
    // 这里仅做收集，编译完成后统一处理
    if (subRootMap) {
        const oraText = createOraText("collect");
        const spinner = ora().start(oraText.start());
        // 复原tempFiles
        restoreTempFiles(tempFiles);
        // 收集对应的自定义组件信息
        const componentMapPreset = collectComponentMapPreset(tempFiles, subRootMap);
        const componentMap = collectComponentMap(componentMapPreset);
        const { movePathMap } = collectMovePathMap({ subRootMap, componentMap });
        ctx.subPackagesMap = {
            ...ctx.subPackagesMap,
            componentMap,
            movePathMap
        };
        spinner.succeed(oraText.succeed());
        // 修正组件引用路径
        fixComponentsPath(tempFiles);
    }
}

/**
 * 
 * @description 修改编译资源
 * @param assets 
 */
export function modifyBuildAssets(assets) {
    const ctx = ref.current;
    const { subRootMap } = ctx.subPackagesMap || {};
    if(!subRootMap) return;
    const deleteKeys = [];
    loopTraversalMovePathMap(({ from: fromHasSuffix, to }) => {
        const { from = fromHasSuffix } = subRootMap[fromHasSuffix] || {};
        const assetsPath = getAssetsPathByTempFilesPath(from, assets);
        assetsPath.forEach(([file, suffix]) => {
            assets[getPureAssetsPath(to) + suffix] = assets[file];
            deleteKeys.push(file);
        });
    });
    deleteSomeKeys(deleteKeys, assets);
    // 删除移动的文件
    deleteMovedPaths();
}

/**
 * 
 * @description 移入主包后修正引用的组件路径
 */
function fixComponentsPath(tempFiles) {
    const deleteKeys = [];
    const ctx = ref.current;
    const movedPathMap = {}
    loopTraversalMovePathMap(({ from, to }) => {
        const itemInfo = tempFiles[from];
        if (!itemInfo) return;
        tempFiles[to] = itemInfo;
        movedPathMap[to] = true;
        deleteKeys.push(from);
        fixUsingComponentsPath(itemInfo, { from, to, tempFiles });
    });
    ctx.subPackagesMap.movedPathMap = movedPathMap;
    // 删除已经移动的文件模板
    deleteSomeKeys(deleteKeys, tempFiles);
}

/**
 * 
 * @description 修正自定义组件引用路径
 * @param itemInfo 
 * @returns 
 */
function fixUsingComponentsPath(itemInfo, opts) {
    const ctx = ref.current;
    const { movePathMap, movedPathMap = {} } = ctx.subPackagesMap;
    const { config: { usingComponents } = {} as any } = itemInfo || {};
    if (!usingComponents) return;
    const { from, to, isBack = false, tempFiles } = opts;
    Object.keys(usingComponents).forEach(name => {
        const relativePath = usingComponents[name];
        const { absolutePath, relativePath: relativePathMoved } = getPathAfterMove(from, to, relativePath);
        const { sourcePathExt } = getTempFilesExtPath(absolutePath, tempFiles);
        const move = isBack ? movedPathMap[sourcePathExt] : !!movePathMap[sourcePathExt];
        if (move) return;
        usingComponents[name] = relativePathMoved;
    });
}

/**
 * 
 * @description 将移动过的 tempFiles 复原
 * @param tempFiles 
 * @returns 
 */
function restoreTempFiles(tempFiles) {
    const deleteKeys = [];
    loopTraversalMovePathMap(({ from, to }) => {
        const itemInfo = tempFiles[to];
        if (itemInfo) {
            // 需要回退
            if (!tempFiles[from]) {
                // 多文件回退的，回退一次即可；其他文件直接移除
                tempFiles[from] = itemInfo;
                fixUsingComponentsPath(itemInfo, { from: to, to: from, tempFiles, isBack: true });
            }
            deleteKeys.push(to);
        }
    });
    deleteSomeKeys(deleteKeys, tempFiles);
}