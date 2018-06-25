(function ($) {
  "use strict"; // Start of use strict
  $(document).ready(function () {

    // Syntax highlighting
    hljs.initHighlightingOnLoad();

    // Header
    var menuToggle = $('#js-mobile-menu').unbind();
    $('#js-navigation-menu').removeClass("show");
    menuToggle.on('click', function (e) {
      e.preventDefault();
      $('#js-navigation-menu').slideToggle(function () {
        if ($('#js-navigation-menu').is(':hidden')) {
          $('#js-navigation-menu').removeAttr('style');
        }
      });
    });

    // Lightbox2 options
    lightbox.option({
      'wrapAround': true
    });

    // fitvid on embed
    $('.media').fitVids();

    // jQuery for page scrolling feature - requires jQuery Easing plugin
    $('a.page-scroll').bind('click', function (event) {
      var $anchor = $(this);
      $('html, body').stop().animate({
        scrollTop: $($anchor.attr('href')).offset().top - 50
      }, 1500, 'easeInOutExpo');
      event.preventDefault();
    });


  });

})(jQuery); // End of use strict
