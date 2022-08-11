// Generated using webpack-cli https://github.com/webpack/webpack-cli

const path = require("path")
const HtmlWebpackPlugin = require("html-webpack-plugin")

const isProduction = process.env.NODE_ENV == "production"

const stylesHandler = "style-loader"

const config = {
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
  },
  devServer: {
    open: true,
    host: "localhost",
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "index.html",
    }),
  ],
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/i,
        loader: "ts-loader",
        exclude: ["/node_modules/"],
      },
      {
        test: /\.css$/i,
        use: [stylesHandler, "css-loader"],
      },
      {
        test: /\.s[ac]ss$/i,
        use: [stylesHandler, "css-loader", "sass-loader"],
      },
      {
        test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
        type: "asset",
      },

      // Add your rules for custom modules here
      // Learn more about loaders from https://webpack.js.org/loaders/
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", "..."],
  },
  externals: {
    zlibjs: "Zlib",
  },
}

module.exports = () => {
  if (isProduction) {
    // const WorkboxWebpackPlugin = require("workbox-webpack-plugin")
    // const WebpackPwaManifest = require("webpack-pwa-manifest")
    config.mode = "production"

    // config.plugins.push(new WorkboxWebpackPlugin.GenerateSW())
    // config.plugins.push(
    //   new WebpackPwaManifest({
    //     short_name: "SCP Converter",
    //     name: "Sonolus SCP Converter",
    //     display: "standalone",
    //     start_url: "index.html",
    //     background_color: "#ffffff",
    //     theme_color: "#000000",
    //   })
    // )
  } else {
    config.mode = "development"
  }
  return config
}
