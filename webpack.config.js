const webpack = require('webpack')
const PrimusWebpackPlugin = require('primus-webpack-plugin')
const path = require('path');
module.exports = {
    entry: "./src/primusServer.js",
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'main.js'
    },
    plugins:[
        new PrimusWebpackPlugin({
            filename: 'primus-client.js',
            minify: false,
            primusOptions: {
              parser: {
                encoder: function (data, fn) {
                  fn(null, JSON.stringify(data))
                },
                decoder: function (data, fn) {
                  fn(null, JSON.parse(data))
                }
              }
            }
        }),
        new webpack.IgnorePlugin(/fs/),
        new webpack.IgnorePlugin(/uws/),
        new webpack.IgnorePlugin(/tls/),
        new webpack.IgnorePlugin(/sockjs/),
        new webpack.IgnorePlugin(/primus-msgpack/),
        new webpack.IgnorePlugin(/hiredis/),
        new webpack.IgnorePlugin(/faye-websocket/),
        new webpack.IgnorePlugin(/ejson/),
        new webpack.IgnorePlugin(/cluster/),
        new webpack.IgnorePlugin(/browserchannel/),
        new webpack.IgnorePlugin(/binary-pack/)
    ]
}