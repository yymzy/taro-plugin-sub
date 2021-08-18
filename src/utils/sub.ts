import ora from "ora";
import { formatSubPackages, collectMovePaths, createOraText, deleteMovedPaths, ref, collectComponentMapPreset, collectComponentMap, deleteSomeKeys, getSourceExtPath, getPathAfterMove, getAssetsExtPaths } from "utils";

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
        const { subPackages, preloadRule, movePaths: pageMovePaths, subRootMap } = formatSubPackages(tempFiles);
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
        console.log("componentMap", componentMap);
        const { componentBackPaths, componentMovePaths } = collectMovePaths(componentMap);
        const movePaths = [...pageMovePaths, ...componentMovePaths];
        ctx.subPackagesMap = {
            ...ctx.subPackagesMap,
            movePaths,
            componentBackPaths,
            componentMap
        };
        spinner.succeed(oraText.succeed());
        // 修正组件引用路径
        fixComponentsAndStylePath(componentBackPaths, tempFiles, true);
        fixComponentsAndStylePath(movePaths, tempFiles);
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
    const movePathsPure = movePaths.map(item => item.map(item => item.replace(sourcePath + "/", "")));
    const deleteKeys = [];
    movePathsPure.forEach(([from, to]) => {
        getAssetsExtPaths(from, assets).forEach(([assetsPathExt, suffix]) => {
            assets[to + suffix] = assets[assetsPathExt];
            deleteKeys.push(assetsPathExt);
        });
    });
    deleteSomeKeys(deleteKeys, assets);
    // 删除移动的文件
    deleteMovedPaths(movePaths);
}

/**
 * 
 * @description 移入主包后修正引用的组件路径
 */
function fixComponentsAndStylePath(movePaths, tempFiles, isBack = false) {
    const deleteKeys = [];
    movePaths.forEach(([from, to]) => {
        const { sourcePathExt, suffix } = getSourceExtPath(from, tempFiles);
        if (sourcePathExt) {
            const itemInfo = tempFiles[sourcePathExt]
            tempFiles[to + suffix] = itemInfo;
            fixUsingComponents(itemInfo, { from, to, isBack });
            deleteKeys.push(sourcePathExt);
        }
    });
    // 删除已经移动的文件模板
    deleteSomeKeys(deleteKeys, tempFiles);
}

/**
 * 
 * @description 修正自定义组件的引用路径
 * @param itemInfo 
 */
function fixUsingComponents(itemInfo, opts) {
    const { config: { usingComponents } = {} as any } = itemInfo || {};
    if (!usingComponents) return;
    const { from, to, isBack } = opts;
    const ctx = ref.current;
    const { componentMap } = ctx.subPackagesMap || {}
    Object.keys(usingComponents).forEach(name => {
        const relativePath = usingComponents[name]; // 相对路径 ../../components/sub/index.wkd;
        const {
            absolutePath,
            relativePath: relativePathMoved
        } = getPathAfterMove(from, to, relativePath);
        const { move = false } = componentMap[absolutePath] || {};
        // 返回主包时不应该修改同步跟随移动过来的包；
        if (isBack ? move : !move) {
            // 说明此组件未移入子包，需要更改引入路径
            usingComponents[name] = relativePathMoved;
        }
    });

}