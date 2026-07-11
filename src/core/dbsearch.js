/*
 * Avro Phonetic engine -- web port (chunk 8: dictionary search)
 * Derived from ibus-avro (jsAvroPhonetic), (C) OmicronLab.
 * Original license: Mozilla Public License 2.0 (https://mozilla.org/MPL/2.0/)
 * This chunk: GJS/IBus/GTK/Gio dependencies removed for browser use.
 */
Avro.DBSearch = function DBSearch () {
    this._init();
}

Avro.DBSearch.prototype = {
    
	search: function (enText) {
        
        var lmc = enText.toLowerCase().charAt(0); 
        var tableList = [];
        switch (lmc) {
            case 'a':
                tableList = ["a", "aa", "e", "oi", "o", "nya", "y"];
                break;
            case 'b':
                tableList = ["b", "bh"];
                break;
            case 'c':
                tableList = ["c", "ch", "k"];
                break;
            case 'd':
                tableList = ["d", "dh", "dd", "ddh"];
                break;
            case 'e':
                tableList = ["i", "ii", "e", "y"];
                break;
            case 'f':
                tableList = ["ph"];
                break;
            case 'g':
                tableList = ["g", "gh", "j"];
                break;
            case 'h':
                tableList = ["h"];
                break;
            case 'i':
                tableList = ["i", "ii", "y"];
                break;
            case 'j':
                tableList = ["j", "jh", "z"];
                break;
            case 'k':
                tableList = ["k", "kh"];
                break;
            case 'l':
                tableList = ["l"];
                break;
            case 'm':
                tableList = ["h", "m"];
                break;
            case 'n':
                tableList = ["n", "nya", "nga", "nn"];
                break;
            case 'o':
                tableList = ["a", "u", "uu", "oi", "o", "ou", "y"];
                break;
            case 'p':
                tableList = ["p", "ph"];
                break;
            case 'q':
                tableList = ["k"];
                break;
            case 'r':
                tableList = ["rri", "h", "r", "rr", "rrh"];
                break;
            case 's':
                tableList = ["s", "sh", "ss"];
                break;
            case 't':
                tableList = ["t", "th", "tt", "tth", "khandatta"];
                break;
            case 'u':
                tableList = ["u", "uu", "y"];
                break;
            case 'v':
                tableList = ["bh"];
                break;
            case 'w':
                tableList = ["o"];
                break;
            case 'x':
                tableList = ["e", "k"];
                break;
            case 'y':
                tableList = ["i", "y"];
                break;
            case 'z':
                tableList = ["h", "j", "jh", "z"];
                break;
            default:
                break;
         }
         
         var pattern = this._regex.parse(enText);
         pattern = '^' + pattern + '$';
         
        var retWords = [];
        
        for(i in tableList) {
             var table = 'w_' + tableList[i];
             retWords = retWords.concat(this._searchInArray(pattern, Avro.Data.dict[table]));
         }
        
        return retWords;
  	},
  	
  	
  	_searchInArray: function(pattern, wArray){
        var retWords = [];
        var word = '';
        var re = new RegExp(pattern);

        for (w in wArray){
            word = wArray[w];
            if (re.test(word)){
                retWords.push(word);
            }
        }
  	    return retWords;
  	},


	_init: function () {
        this._regex = new Avro.Regex();
  	}
}
