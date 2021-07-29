import { mvSubPackages, } from "../utils/";

export default (ctx, opts) => {
    ctx.onBuildFinish(() => {
        mvSubPackages(ctx);
    });
};
