import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import sourcemap from "rollup-plugin-sourcemaps";
import typescript from "rollup-plugin-typescript2";
import common from "@rollup/plugin-commonjs";
import autoExternal from "rollup-plugin-auto-external";
import { uglify } from "rollup-plugin-uglify";
import alias from "@rollup/plugin-alias";

const pkg = require("./package.json");

const banner = `/*!
   * ${pkg.name} v${pkg.version}
   * (c) 2021-${new Date().getFullYear()} yym
   * Released under the MIT License.
   */`;

export default {
  input: "src/index.ts",
  output: {
    banner,
    format: "cjs",
    sourcemap: true,
    file: pkg.main,
    name: pkg.name,
    exports: "named",
  },
  external: ["miniprogram-ci", "path", "tty", "os"],
  plugins: [
    resolve(),
    common(),
    json(),
    alias({
      core: "./src/core",
      command: "./src/core/command",
      utils: "./src/utils",
      types: "./src/types",
    }),
    autoExternal(),
    typescript({ useTsconfigDeclarationDir: true }),
    sourcemap(),
    uglify(),
  ],
};
