import { mvSubPackages, splitChunks, updateConfig } from "../utils/";

export default (ctx, opts) => {

    /**
     * @description 更新编译配置项
     */
    updateConfig(ctx);

    /**
     * @description 修改chain
     */
    ctx.modifyWebpackChain((opts) => splitChunks(ctx, opts));

    /**
     * @description 编译完成
     */
    ctx.onBuildFinish(() => {
        mvSubPackages(ctx);
    });
};
