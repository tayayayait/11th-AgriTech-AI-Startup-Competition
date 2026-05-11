<% @CODEPAGE="65001" language="VBScript" %>
<html>
<head>
<meta http-dquiv="Content-Type" content="text/html" charset="utf-8">
<title>농약안전사용지침</title>
<script type='text/javascript'>
//검색
function fncSearch(){
	with(document.searchApiForm){
		sNationVal.value = fncCheckValue(document.getElementsByName("sNationChk"));
		pageNo.value = "1";
		method="get";
		action = "agchmSafeManualList.asp";
		target = "_self";
		submit();
	}
}
//페이지 이동
function fncGoPage(page){
	with(document.searchApiForm){
		pageNo.value = page;
		method="get";
		action = "agchmSafeManualList.asp";
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
<form name="searchApiForm">
<input type="hidden" name="pageNo" value="<%=Request("pageNo")%>">
<input type="hidden" name="sNationVal" value="<%=Request("sNationVal")%>">
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
			지침명 <input type="text" name="sCntntsSj" value="<%=Request("sCntntsSj")%>">
			작목 <input type="text" name="sPrdlstCodeNm" value="<%=Request("sPrdlstCodeNm")%>">
			개정년도 <input type="text" name="sReformYear" value="<%=Request("sReformYear")%>">
			<input type="button" name="search" value="검색" onclick="return fncSearch();"/>
		</td>
	</tr>
<%
	'apiKey - 농사로 Open API에서 신청 후 승인되면 확인가능
	apiKey = "nongsaroSampleKey"
	'서비스 명
	serviceName = "agchmSafeManual"
	'오퍼레이션 명
	operationName = Array("nationList")

	Set xmlDOMS=Server.CreateObject("Scripting.Dictionary")

	For i=0 To UBound(operationName)
		'XML 받을 URL 생성
		parameter = "/" & serviceName & "/" & operationName(i)
		parameter = parameter & "?apiKey="&apiKey

		targetURL = "http://api.nongsaro.go.kr/service" & parameter

		'농사로 Open API 통신 시작
		Set xmlHttp = Server.CreateObject("Microsoft.XMLHTTP")
		xmlHttp.Open "GET", targetURL, False
		xmlHttp.Send

		Set oStream = CreateObject("ADODB.Stream")
		oStream.Open
		oStream.Position = 0
		oStream.Type = 1
		oStream.Write xmlHttp.ResponseBody
		oStream.Position = 0
		oStream.Type = 2
		oStream.Charset = "utf-8"
		sText = oStream.ReadText
		oStream.Close

		xmlDOMS.Add operationName(i), sText
	Next

	'검색조건
	For n=0 To UBound(operationName)

	'오퍼레이션명
	operNm = operationName(n)
	'검색조조건 명
	srchNm = ""
	'타입명
	typeNm = ""
	'타입명 값
	typeVal = ""

	'국가 목록
	If operNm = "nationList" Then
		srchNm = "국가 목록"
		typeNm = "sNationChk"
		typeVal = "sNationVal"
	End if

	sText = xmlDOMS.Item(operNm)

	Set xmlDOM = server.CreateObject("MSXML.DOMDOCUMENT")
	xmlDOM.async = False
	xmlDOM.LoadXML sText
	'농사 Open API 통신 끝

	Set listItem = xmlDOM.SelectNodes("//items")
	cnt = listItem(0).childNodes.length
	Set items = listItem(0).childNodes

	Response.Write("<tr><th>"+srchNm+"</th><td>")
	If cnt = 0 Then
		Response.Write("조회한 정보가 없습니다.")
	Else
		For i=0 To cnt-1
			 Set itemNode = items.item(i)
			If NOT itemNode Is Nothing Then
				'코드
				If NOT itemNode.SelectSingleNode("code") is Nothing Then
					code = itemNode.SelectSingleNode("code").text
				End If
				'코드명
				If NOT itemNode.SelectSingleNode("codeNm") is Nothing Then
					codeNm = itemNode.SelectSingleNode("codeNm").text
				End If
			End If
%>
			<input type="checkbox" id="<%=typeNm%>" name="<%=typeNm%>" value="<%=code%>"
<%
				If Not Request(typeVal) is Nothing  Then
					chkVal = Request(typeVal)
					chkValArr = Split(chkVal, ",")
					For j=0 To UBound(chkValArr)
						If code = chkValArr(j) Then
							Response.Write("checked")
						End if
					Next
				End if%> ><%=codeNm%>&nbsp;
<%
		 Set itemNode = Nothing
		 Next
	End If
	Response.Write("</td></tr>")
	Next

%>
		</table>
	</form>
<%
If true Then
	'오퍼레이션 명
	operationName = "agchmSafeManualList"

	'XML 받을 URL 생성
	parameter = "/" & serviceName & "/" & operationName
	parameter = parameter & "?apiKey=" & apiKey
	parameter = parameter & "&pageNo=" & Request("pageNo")

	searchNmArr = Array("sCntntsSj", "sPrdlstCodeNm", "sReformYear", "sNationVal")
	For i=0 To UBound(searchNmArr)
		If Not Request(searchNmArr(i)) Is Nothing And Request(searchNmArr(i)) <> "" Then
			parameter = parameter & "&" & searchNmArr(i) & "=" & Server.URLEncode(Request(searchNmArr(i)))
		End If
	Next

	targetURL = "http://api.nongsaro.go.kr/service" & parameter

	'농사로 Open API 통신 시작
	Set xmlHttp = Server.CreateObject("Microsoft.XMLHTTP")
	xmlHttp.Open "GET", targetURL, False
	xmlHttp.Send

	Set oStream = CreateObject("ADODB.Stream")
	oStream.Open
	oStream.Position = 0
	oStream.Type = 1
	oStream.Write xmlHttp.ResponseBody
	oStream.Position = 0
	oStream.Type = 2
	oStream.Charset = "utf-8"
	sText = oStream.ReadText
	oStream.Close

	Set xmlDOM = server.CreateObject("MSXML.DOMDOCUMENT")
	xmlDOM.async = False
	xmlDOM.LoadXML sText
	'농사 Open API 통신 끝

	Set listItem = xmlDOM.SelectNodes("//items")
	cnt = listItem(0).childNodes.length
	Set items = listItem(0).childNodes

'페이징 처리를 위한 값 받기
	'한 페이지에 제공할 건수
	Set numOfRows = xmlDOM.SelectNodes("//numOfRows")
	If Not numOfRows(0) Is Nothing Then numOfRowsText= numOfRows(0).Text Else numOfRowsText = "10" End If
	'조회할 페이지 번호
	Set pageNo = xmlDOM.SelectNodes("//pageNo")
	If Not pageNo(0) Is Nothing Then pageNoText= pageNo(0).Text Else pageNoText = "1" End If
	'조회된 총 건수
	Set totalCount = xmlDOM.SelectNodes("//totalCount")
	If Not totalCount(0) Is Nothing Then totalCountText= totalCount(0).Text Else totalCountText = "" End If

	If cnt-3 = 0 Then
		Response.Write("<h3>조회된 정보가 없습니다.</h3>")
	Else
	%>
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
	<%
			For i=0 To cnt-4
			   Set itemNode = items.item(i)
				If NOT itemNode Is Nothing Then
					'국가
					If NOT itemNode.SelectSingleNode("nationCodeNm") is Nothing Then
						nationCodeNm = itemNode.SelectSingleNode("nationCodeNm").text
					End If
					'작목
					If NOT itemNode.SelectSingleNode("prdlstCodeNm") is Nothing Then
						prdlstCodeNm = itemNode.SelectSingleNode("prdlstCodeNm").text
					End If
					'개정년월
					If NOT itemNode.SelectSingleNode("reformYm") is Nothing Then
						reformYm = itemNode.SelectSingleNode("reformYm").text
					End If
					'지침명
					If NOT itemNode.SelectSingleNode("cntntsSj") is Nothing Then
						cntntsSj = itemNode.SelectSingleNode("cntntsSj").text
					End If
					'첨부파일 URL
					If NOT itemNode.SelectSingleNode("fileUrl") is Nothing Then
						fileUrl = itemNode.SelectSingleNode("fileUrl").text
					End If
					'첨부파일
					If NOT itemNode.SelectSingleNode("fileNm") is Nothing Then
						fileNm = itemNode.SelectSingleNode("fileNm").text
					End If
				End If

	%>
		<tr>
				<td align="center"><%=nationCodeNm%></td>
				<td align="center"><%=prdlstCodeNm%></td>
				<td align="center"><%=reformYm%></td>
				<td><%=cntntsSj%></td>
				<td align="center"><a href="<%=fileUrl%>">파일다운로드</a></td>
		</tr>
	<%
			   Set itemNode = Nothing
			Next
			Response.Write("</table>")
		End If

		'페이징 처리
		function ceil(x)
	        dim temp
	        temp = Round(x)
	        if temp < x then
	            temp = temp + 1
	        end if
	        ceil = temp
	    end function


		pageGroupSize = 10
		pageSize = Int(numOfRowsText)


		start = Int(pageNoText)

		currentPage = Int(pageNoText)

		startRow = (currentPage - 1) * pageSize + 1
		endRow = currentPage * pageSize
		count = Int(totalCountText)
		number=0

		number=count-(currentPage-1)*pageSize

		pageGroupCount = count/(pageSize*pageGroupSize)

		numPageGroup = Int(ceil(currentPage/pageGroupSize))

		If count > 0 Then
			pageCount = Int(count / pageSize)


			If (count Mod pageSize) = 0 Then
				pageCount = pageCount + 0
			Else
				pageCount = pageCount + 1
			End If

			startPage = pageGroupSize*(numPageGroup-1)+1
			endPage = startPage + pageGroupSize-1
			prtPageNo = 0

			If endPage > pageCount Then
				endPage = pageCount
			End If

			If numPageGroup > 1 Then
				prtPageNo = (numPageGroup-2)*pageGroupSize+1
				Response.Write("<a href='javascript:fncGoPage("&prtPageNo&");'>[이전]</a>")
			End If

			i=startPage
			While i<=endPage

				prtPageNo = i
				Response.Write("<a href='javascript:fncGoPage("&prtPageNo&");'>")

				If currentPage = i Then
					Response.Write("<strong>["&i&"]</strong>")
				Else
					Response.Write("["&i&"]")
				End If

				Response.Write("</a>")

				i = i+1
			Wend

			If numPageGroup < pageGroupCount Then
				prtPageNo = (numPageGroup*pageGroupSize+1)
				Response.Write("<a href='javascript:fncGoPage("&prtPageNo&");'>[다음]</a>")
			End If
		End If
		'페이징처리 끝
End If
%>
</body>
</html>
