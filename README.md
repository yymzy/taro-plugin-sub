# taro-plugin-sub

基于 taro 做分包拓展，

```js
/**
 * root 文件所在根路径
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
      outputRoot: "auto|其他自定路径",
      pages: ["address/index"],
    },
  ];
}
```

## 使用许可

[MIT](LICENSE) © yymzy
