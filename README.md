# taro-plugin-sub

基于 taro 做分包拓展，

```js
/**
 * root 文件所在根路径
 *
 * preloadRule 页面路劲，进入该页面下载分包
 *
 * network 现在分包的网络 默认为all
 *
 * outputRoot "auto" 根据root自动转化， "string" 自定义子包跟路径；默认为auto
 * 例1：outputRoot:"auto"，
 *     打包后页面路径为 `pages-${index}/page/index`
 * 例2：outputRoot:"user"，
 *     打包后页面路径为 `${outputRoot}/address/index`
 *
 * pages 子包页面路径列表
 */
{
  subPackages: [
    {
      root: "pages",
      preloadRule: "pages/index",
      network: "all",
      outputRoot: "auto|其他自定路径",
      pages: ["address/index"],
    },
  ];
}
```

## 使用许可

[MIT](LICENSE) © yymzy
