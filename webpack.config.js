var webpack = require('webpack')



module.exports = {
    entry: ["./lib/backend.js"],

    output: {
        path: __dirname + '/dist',
        filename: "remote.js"
    },

    module: {
        loaders: [
            {test: /\.jsx?$/,                   loader: 'babel', exclude: [/forge.bundle.js/, /node_modules/] },
            {test: /\.js$/,                     loader: 'babel-loader', exclude: [/forge.bundle.js/, /node_modules/] },
        ]
    },

    resolve: {
      alias: {
        'node-forge': '../src/forge.bundle.js'
      }
    },

    plugins: [
      new webpack.NoErrorsPlugin()
    ]

};
