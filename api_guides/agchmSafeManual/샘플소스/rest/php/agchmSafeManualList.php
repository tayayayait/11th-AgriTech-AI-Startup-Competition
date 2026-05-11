<?php
error_reporting(E_ALL);
ini_set("display_errors", 1);
?>


<html>
<head>
<meta charset="utf-8"/>
<meta http-dquiv="Content-Type" content="text/html" charset="utf-8"/>
<title>농약안전사용지침</title>
<script type='text/javascript'>
//검색
function fncSearch(){
	with(document.searchApiForm){
		sNationVal.value = fncCheckValue(document.getElementsByName("sNationChk"));
		pageNo.value = "1";
		method="get";
		action = "agchmSafeManualList.php";
		target = "_self";
		submit();
	}
}
//페이지 이동
function fncGoPage(page){
	with(document.searchApiForm){
		pageNo.value = page;
		method="get";
		action = "agchmSafeManualList.php";
		target = "_self";
		submit();
	}
}

function fncCheckValue(obj){
	var checkValue = "";

	for(var i=0; i<obj.length; i++){
		if(obj[i].checked == true){
			checkValue += obj[i].value + ",";
		}
	}

	if(checkValue!="") checkValue = checkValue.substring(0, checkValue.length-1);

	return checkValue;
}
</script>
</head>
<body>
<h4><strong> * 샘플화면은 디자인을 적용하지 않았으니, 개별 사이트의 스타일에 맞게 코딩하시기 바랍니다.</strong></h4>
<h3><strong>농약안전사용지침</strong></h3>
<hr>
<?PHP
$sType = isset($_REQUEST["sType"]) ? $_REQUEST["sType"] : "" ;
$wordType = isset($_REQUEST["wordType"]) ? $_REQUEST["wordType"] : "" ;
$word = isset($_REQUEST["word"]) ? $_REQUEST["word"] : "" ;
$priceType = isset($_REQUEST["priceType"]) ? $_REQUEST["priceType"] : "" ;
$priceTypeSel = isset($_REQUEST["priceTypeSel"]) ? $_REQUEST["priceTypeSel"] : "" ;
$waterCycleSel = isset($_REQUEST["waterCycleSel"]) ? $_REQUEST["waterCycleSel"] : "" ;
?>
<form name="searchApiForm">
<input type="hidden" name="pageNo" value="<?PHP if(isset($_REQUEST["pageNo"])){ echo $_REQUEST["pageNo"]; }?>">
<input type="hidden" name="sNationVal" value="<?PHP if(isset($_REQUEST["sNationVal"])){ echo $_REQUEST["sNationVal"]; }?>">

<table width="100%" border="1" cellSpacing="0" cellPadding="0">
	<colgroup>
		<col width="20%"/>
		<col width="80%"/>
	</colgroup>
	<tr>
		<th>
			검색조건
		</th>
		<td>
			지침명 <input type="text" name="sCntntsSj" value="<?PHP if(isset($_REQUEST["sCntntsSj"])){ echo $_REQUEST["sCntntsSj"]; }?>">
			작목 <input type="text" name="sPrdlstCodeNm" value="<?PHP if(isset($_REQUEST["sPrdlstCodeNm"])){ echo $_REQUEST["sPrdlstCodeNm"]; }?>">
			개정년도 <input type="text" name="sReformYear" value="<?PHP if(isset($_REQUEST["sReformYear"])){ echo $_REQUEST["sReformYear"]; }?>">
			<input type="button" name="search" value="검색" onclick="return fncSearch();"/>
		</td>
	</tr>
<?PHP
//apiKey - 농사로 Open API에서 신청 후 승인되면 확인 가능
$apiKey = "nongsaroSampleKey";
//서비스 명
$serviceName = "agchmSafeManual";
//오퍼레이션 명
$operationName = array("nationList");

$urls = array();


for($i=0; $i<count($operationName); $i++){
  //XML 받을 URL 생성
  $parameter = "/".$serviceName."/".$operationName[$i];
  $parameter .= "?apiKey=".$apiKey;

  $url = "http://api.nongsaro.go.kr/service" . $parameter;

  $urls[$operationName[$i]] = $url;
}

$codes = "";
$codeNm = "";

//검색조건 명
$srchNmArr = array("국가 목록");
//타입명
$typeNmArr = array("sNationChk");
//타입명 값
$typeValArr = array("sNationVal");

for($i=0; $i<count($operationName); $i++){
  //오퍼레이션명
  $operNm = $operationName[$i];
	$srchNm = $srchNmArr[$i];
	$typeNm = $typeNmArr[$i];
	//타입명 값
	$typeVal = $typeValArr[$i];

  //XML Parsing
  $xml = file_get_contents($urls[$operationName[$i]]);
  //PHP5.x 이상이 설치되어 있어야 하며, php.ini에 allow_url_fopen을 on으로 해주시기 바랍니다.
  $object = simplexml_load_string($xml);

  echo "<tr><th>" .$srchNm ."</th><td>";
	if(count($object->body[0]->items[0]->item) == 0){
	echo "조회한 정보가 없습니다.";
	}else{
    $index = 0;
		foreach($object->body[0]->items[0]->item as $item){
			//코드
			$code = $item->code;
			//코드명
			$codeNm = $item->codeNm;
?>
        <input type="checkbox" id="<?=$typeNm?>" name="<?=$typeNm?>" value="<?=$code?>" <?PHP
        if(isset($_REQUEST[$typeVal])){
          $chkVar = $_REQUEST[$typeVal];
          $chkArr = explode(",", $chkVar);
          for($j=0; $j<sizeof($chkArr); $j++){
            if($code == $chkArr[$j]){
              echo "checked";
            }
          }
        }
        ?> /><?=$codeNm?>&nbsp;
<?PHP
    $index = $index + 1;
		}
  }
  echo "</td></tr>";
}
?>
</table>
</form>
<hr>
<?PHP
if(true){
	//오퍼레이션 명
	$operationName = "agchmSafeManualList";

	//XML 받을 URL 생성
	$parameter = "/".$serviceName."/".$operationName;
	$parameter .= "?apiKey=".$apiKey;

  $srchNmArr = array("pageNo","sCntntsSj", "sPrdlstCodeNm", "sReformYear", "sNationVal");

  for($i=0; $i<sizeof($srchNmArr); $i++){
    if(isset($_REQUEST[$srchNmArr[$i]])){
      $parameter .= "&".$srchNmArr[$i]."=".$_REQUEST[$srchNmArr[$i]];
    }
  }

	$url = "http://api.nongsaro.go.kr/service" . $parameter;

	//XML Parsing
	$xml = file_get_contents($url);
	//PHP5.x 이상이 설치되어 있어야 하며, php.ini에 allow_url_fopen을 on으로 해주시기 바랍니다.
	$object = simplexml_load_string($xml);

	if(count($object->body[0]->items[0]->item) == 0){
	   echo "조회된 정보가 없습니다.";
	}else{
?>
	<hr>
	<table width="100%" border="1" cellSpacing="0" cellPadding="0">
	<colgroup>
		<col width="*"/>
		<col width="*"/>
		<col width="*"/>
		<col width="*"/>
		<col width="*"/>
	</colgroup>
	<tr>
		<th>국가</th>
		<th>작목</th>
		<th>개정년월</th>
		<th>지침명</th>
		<th>첨부파일</th>
	</tr>
<?PHP
		foreach($object->body[0]->items[0]->item as $item){
			//국가
			$nationCodeNm = $item->nationCodeNm;
			//작목
			$prdlstCodeNm = $item->prdlstCodeNm;
			//개정년월
			$reformYm = $item->reformYm;
			//지침명
			$cntntsSj = $item->cntntsSj;
			//첨부파일URL
			$fileUrl = $item->fileUrl;
			//첨부파일명
			$fileNm = $item->fileNm;

?>
			<tr>
				<td align="center"><?=$nationCodeNm?></td>
				<td align="center"><?=$prdlstCodeNm?></td>
				<td align="center"><?=$reformYm?></td>
				<td><?=$cntntsSj?></td>
				<td align="center"><a href="<?=$fileUrl?>">파일다운로드</a></td>
			</tr>
<?PHP
		}
?>
	</table>
<?PHP
	}
//페이징 처리
	//한 페이지에 제공할 건수
	$numOfRows = $object->body[0]->items[0]->numOfRows;
	//조회된 총 건수
	$totalCount = $object->body[0]->items[0]->totalCount;
	//조회할 페이지 번호
	$pageNo = $object->body[0]->items[0]->pageNo;

	$pageGroupSize = 10;
	$pageSize = 0;

	$pageSize = (int)$numOfRows;
	if($pageSize==0) $pageSize=10;

	$start = (int)$pageNo;
	if($start==0)$start=1;

	$currentPage = (int)$pageNo;

	$startRow = ($currentPage -1) * $pageSize +1;//한 페이지의 시작글 번호
	$endRow = $currentPage * $pageSize;//한 페이지의 마지막 글번호

	$count = (int)$totalCount;
	$number=0;

	$number=$count-($currentPage-1)*$pageSize;//글목록에 표시할 글번호

	//페이지그룹의 갯수
	//ex) pageGroupSize가 3일 경우 '[1][2][3]'가 pageGroupCount 개 만큼 있다.
	$pageGroupCount = $count/($pageSize*$pageGroupSize);

	//페이지 그룹 번호
	//ex) pageGroupSize가 3일 경우  '[1][2][3]'의 페이지그룹번호는 1 이고  '[2][3][4]'의 페이지그룹번호는 2 이다.
	$numPageGroup = (int)ceil((double)$currentPage/$pageGroupSize);

	if($count > 0){
		$pageCount = $count / $pageSize + ( $count % $pageSize == 0 ? 0 : 1);
		$startPage = $pageGroupSize*($numPageGroup-1)+1;
		$endPage = $startPage + $pageGroupSize-1;
		$startPnt = 0;

		if($endPage > $pageCount){
			$endPage = $pageCount;
		}

		if($numPageGroup > 1){
			$startPnt = ($numPageGroup-2)*$pageGroupSize+1;
			echo "<a href='javascript:fncGoPage(".$startPnt.");'>[이전]</a>";
		}

		for($i=$startPage; $i<=$endPage; $i++){
			$startPnt = $i;
			echo "<a href='javascript:fncGoPage(".$startPnt.");'>";

			if($currentPage == $i){
				echo "<strong>[$i]</strong>";
			}else{
				echo "[$i]";
			}
			echo "</a>";
		}

		if($numPageGroup < $pageGroupCount){
			$startPnt = ($numPageGroup*$pageGroupSize+1);
			echo "<a href='javascript:fncGoPage(".$startPnt.");'>[다음]</a>";
		}
	}
//페이징 처리 끝
}
?>

</body>
</html>
