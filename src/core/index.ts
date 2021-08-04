import { emptyCache, updateConfig } from "utils";
import { mvSubPackages, modifyBuildTempFileContent, renamePagesName } from "../utils/sub";

export default (ctx, opts) => {

    ctx.onBuildStart(() => {
        updateConfig(ctx);
        emptyCache(ctx);
    });

    /**
     * @description 修改chain
     */
    // ctx.modifyWebpackChain(({ chain }) => {
    //     chain.merge({
    //         optimization: {
    //             splitChunks: {
    //                 cacheGroups: {
    //                     // sub: {  // 待优化，分包引入的模块按分配生成chunks，引入不同的分包
    //                     //     name: "pages-0/sub",
    //                     //     minChunks: 2,
    //                     //     test: (module, chunks) => {
    //                     //         // console.log(module, chunks);
    //                     //         return /\/src\//.test(
    //                     //             module.resource
    //                     //         );
    //                     //     },
    //                     //     priority: 200
    //                     // }
    //                 }
    //             }
    //         }
    //     });
    // });

    /**
     * @description 编译过程中分析组件引用
     */
    ctx.modifyBuildTempFileContent(({ tempFiles }) => modifyBuildTempFileContent(ctx, tempFiles));

    /**
     * @description 编译完成
     */
    ctx.onBuildFinish(async () => {
        await renamePagesName(ctx);
        await mvSubPackages(ctx);
    });
};
