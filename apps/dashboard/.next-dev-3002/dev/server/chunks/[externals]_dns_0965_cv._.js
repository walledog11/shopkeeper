module.exports = [
"[externals]/dns [external] (dns, cjs, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/[externals]_dns_0.vnpcu._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[externals]/dns [external] (dns, cjs)");
    });
});
}),
];