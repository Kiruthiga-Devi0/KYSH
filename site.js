/* KYSH public pages: shared top navigation + footer. Needs product/config.js and product/store.js loaded first. */
(function () {
  const page = document.body.dataset.page || '';
  const link = (href, label, key) => `<li><a href="${href}"${page === key ? ' aria-current="page"' : ''}>${label}</a></li>`;

  const navHost = document.getElementById('site-nav');
  if (navHost) {
    navHost.outerHTML = `
    <header class="nav" id="nav"><div class="nav-inner">
      <a class="brand" href="pg2.html" aria-label="KYSH home"><img src="kyyy.png" alt=""><span>KYSH</span></a>
      <ul class="nav-links" id="navLinks">
        ${link('pg2.html', 'Home', 'home')}${link('product/productlist.html', 'Shop', 'shop')}${link('pg6.html', 'About', 'about')}${link('pg8.html', 'Contact', 'contact')}
      </ul>
      <div class="nav-account" id="navAccount"></div>
      <button class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="navLinks" aria-label="Menu"><span></span><span></span><span></span></button>
    </div></header>`;
    const nav = document.getElementById('nav'), tog = document.getElementById('navToggle');
    tog.addEventListener('click', () => { const o = nav.classList.toggle('open'); tog.setAttribute('aria-expanded', o); });
    const acc = document.getElementById('navAccount');
    acc.innerHTML = '<a class="link" href="pg3.html">Log in</a><a class="btn btn-pink" href="pg5.html">Sign up</a>';
    KYSH.currentUser().then(u => {
      if (!u) return;
      acc.innerHTML = `<span class="muted">Hi, ${KYSH.esc(u.name || u.email || 'there')}</span><a class="btn btn-ink" href="product/productlist.html">Go to shop</a><button class="link" id="navOut" style="background:none;border:0;cursor:pointer;color:inherit">Log out</button>`;
      document.getElementById('navOut').addEventListener('click', KYSH.logout);
    }).catch(() => {});
  }

  const footHost = document.getElementById('site-footer');
  if (footHost) {
    footHost.outerHTML = `
    <footer class="footer"><div class="wrap">
      <div><a class="brand" href="pg2.html"><img src="kyyy.png" alt=""><span>KYSH</span></a>
        <p style="margin-top:16px;max-width:36ch">Women's fashion and style. Simple and elegant.</p></div>
      <div><h4>Shop</h4><ul>
        <li><a href="product/productlist.html">All styles</a></li>
        <li><a href="product/productlist.html?cat=Dress">Dresses</a></li>
        <li><a href="product/productlist.html?cat=Gown">Gowns</a></li>
        <li><a href="product/productlist.html?cat=Kurti">Kurtis</a></li>
        <li><a href="product/productlist.html?cat=Saree">Sarees</a></li></ul></div>
      <div><h4>KYSH</h4><ul>
        <li><a href="pg6.html">About</a></li><li><a href="pg8.html">Contact</a></li>
        <li><a href="pg3.html">Log in</a></li><li><a href="pg5.html">Sign up</a></li></ul></div>
      <p class="fine">© ${new Date().getFullYear()} KYSH Clothing</p>
    </div></footer>`;
  }
})();
