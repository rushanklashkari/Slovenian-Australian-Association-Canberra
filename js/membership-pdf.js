/*
 * Fills the club's official membership form (documents/SAA-Membership-Form-2026.pdf)
 * with the answers from the online application, using pdf-lib (MIT) + fontkit (MIT)
 * and Liberation Sans (SIL OFL) so Slovenian letters (č, š, ž) print correctly.
 *
 * Positions are measured on the scanned form in "px" at 100 dpi (1 px = 0.72 pt).
 */
(function () {
  var TEMPLATE = 'documents/SAA-Membership-Form-2026.pdf';
  var FONT_REG = 'fonts/form-sans-Regular.ttf';
  var FONT_ITA = 'fonts/form-sans-Italic.ttf';
  var LIBS = ['js/vendor/pdf-lib.min.js', 'js/vendor/fontkit.umd.min.js'];

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  var libsReady = null;
  function ensureLibs() {
    if (window.PDFLib && window.fontkit) return Promise.resolve();
    if (!libsReady) libsReady = LIBS.reduce(function (p, src) { return p.then(function () { return loadScript(src); }); }, Promise.resolve());
    return libsReady;
  }
  function getBytes(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.arrayBuffer(); });
  }
  function ddmmyyyy(iso) {
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso);
  }

  // data: plain object of the form's fields (name -> value)
  window.saaBuildMembershipPdf = function (data) {
    return ensureLibs().then(function () {
      return Promise.all([getBytes(TEMPLATE), getBytes(FONT_REG), getBytes(FONT_ITA)]);
    }).then(function (b) {
      var PDFLib = window.PDFLib, rgb = PDFLib.rgb;
      return PDFLib.PDFDocument.load(b[0]).then(function (pdf) {
        pdf.registerFontkit(window.fontkit);
        return Promise.all([pdf.embedFont(b[1], { subset: true }), pdf.embedFont(b[2], { subset: true })]).then(function (fonts) {
          var reg = fonts[0], ita = fonts[1];
          var page = pdf.getPages()[0];
          var ink = rgb(0.05, 0.16, 0.48);
          var X = function (px) { return 0.72 + px * 0.72; };
          var Y = function (px) { return 841.92 - px * 0.72; };

          function text(s, xpx, ypx, wpx, size, font) {
            if (s === undefined || s === null) return;
            s = String(s).replace(/\s+/g, ' ').trim(); if (!s) return;
            font = font || reg; size = size || 10.5;
            var max = wpx * 0.72;
            while (size > 6 && font.widthOfTextAtSize(s, size) > max) size -= 0.5;
            while (s.length > 1 && font.widthOfTextAtSize(s, size) > max) s = s.slice(0, -1);
            page.drawText(s, { x: X(xpx), y: Y(ypx), size: size, font: font, color: ink });
          }
          function ring(cx, cy, rx, ry) {
            page.drawEllipse({ x: X(cx), y: Y(cy), xScale: rx * 0.72, yScale: ry * 0.72, borderColor: ink, borderWidth: 1.3 });
          }

          // ── Applicant
          text(data.surname, 56, 349, 365);
          text(data.first_name, 434, 349, 342);
          text(data.other_names, 56, 395, 365);
          var titles = { 'Mr.': [450, 22], 'Mrs.': [496, 24], 'Ms': [542, 20], 'Dr': [590, 18], 'Other': [640, 26] };
          if (titles[data.title]) ring(titles[data.title][0], 391, titles[data.title][1], 10);
          if (data.title === 'Other') text(data.title_other, 670, 396, 108, 9.5);
          text(data.street, 56, 438, 365);
          text(data.city, 434, 438, 342);
          text(data.suburb, 56, 481, 365);
          text(data.state, 434, 481, 176);
          text(data.postcode, 622, 481, 154);
          text(data.phone_home, 56, 523, 176);
          text(data.phone_work, 242, 523, 180);
          text(data.phone_mobile, 434, 523, 176);
          text(data.email, 622, 523, 156);

          // ── Personal details
          text(ddmmyyyy(data.date_of_birth), 160, 570, 260);
          if (data.parents_slovenian === 'Yes') ring(687, 565, 10, 9);
          if (data.parents_slovenian === 'No') ring(721, 565, 10, 9);
          if (data.grandparents_slovenian === 'Yes') ring(687, 587, 10, 9);
          if (data.grandparents_slovenian === 'No') ring(721, 587, 10, 9);
          text(data.country_of_birth, 160, 612, 610);

          // ── Type of membership
          if (data.member_type === 'full') ring(254, 650, 20, 10);
          if (data.member_type === 'associate') ring(462, 650, 36, 10);

          // ── Declaration
          if (data.signed_name) text(data.signed_name + '  (typed online)', 56, 716, 365, 12, ita);
          text(ddmmyyyy(data.date_signed), 434, 716, 342);

          // ── Seconders (they sign on the printed form; applicant supplies name, years and badge no.)
          var sec = [[756, 798], [842, 884]];
          [1, 2].forEach(function (n, i) {
            var yrs = data['seconder' + n + '_years_known'];
            if (yrs) text(yrs, 547, sec[i][0], 24, 10);
            var nm = data['seconder' + n + '_name'];
            if (nm) text('Seconder: ' + nm, 56, sec[i][1], 365, 8.5);
            text(data['seconder' + n + '_badge'], 622, sec[i][1], 154);
          });

          // ── Footer note
          page.drawText('Submitted online via slovenianclubcanberra.org.au on ' + new Date().toLocaleString('en-AU'), {
            x: X(52), y: Y(1150), size: 7, font: reg, color: rgb(0.45, 0.45, 0.45)
          });
          return pdf.save();
        });
      });
    });
  };
})();
